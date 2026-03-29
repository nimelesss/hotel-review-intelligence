#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="/srv/hotel-review-intelligence"
SERVICE_NAME="hotel-review-intelligence"
LOCK_FILE="/tmp/hri-deploy.lock"
MAX_NPM_ATTEMPTS=3
NODE_HEAP_MB="${NODE_HEAP_MB:-1536}"
LOCK_WAIT_SECONDS="${LOCK_WAIT_SECONDS:-900}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

on_error() {
  local code=$?
  local line=${1:-unknown}
  log "ERROR: deployment failed at line ${line} (exit ${code})"
  systemctl status "$SERVICE_NAME" --no-pager || true
  journalctl -u "$SERVICE_NAME" -n 120 --no-pager || true
  exit "$code"
}
trap 'on_error $LINENO' ERR

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || fail "Required command not found: $cmd"
  done
}

acquire_lock() {
  require_cmd flock
  exec 9>"$LOCK_FILE"
  log "Acquiring deployment lock: $LOCK_FILE (timeout: ${LOCK_WAIT_SECONDS}s)"
  if ! flock -w "$LOCK_WAIT_SECONDS" 9; then
    log "Lock wait timed out. Possible active deploy process:"
    pgrep -af 'deploy-vps.sh|npm run build|next build|drone-ssh|appleboy' || true
    fail "Could not acquire deployment lock within ${LOCK_WAIT_SECONDS}s"
  fi
  log "Deployment lock acquired"
}

assert_environment() {
  [ -d "$APP_DIR" ] || fail "App directory not found: $APP_DIR"
  [ -d "$APP_DIR/.git" ] || fail "Git repository not found in $APP_DIR"
  [ "$APP_DIR" = "/srv/hotel-review-intelligence" ] || fail "Unexpected APP_DIR: $APP_DIR"
}

cleanup_stale_dirs() {
  cd "$APP_DIR"
  find "$APP_DIR" -maxdepth 1 -type d \( -name 'node_modules.bad.*' -o -name 'node_modules.bak.*' \) -print -exec rm -rf {} + || true
}

verify_node_modules() {
  [ -f node_modules/next/package.json ] || return 1
  [ -f node_modules/better-sqlite3/package.json ] || return 1
  node -e "require.resolve('next/package.json');require.resolve('better-sqlite3');" >/dev/null 2>&1
}

install_deps() {
  cd "$APP_DIR"

  if verify_node_modules; then
    log "node_modules looks healthy, reuse existing dependencies"
    return 0
  fi

  local attempt
  for attempt in $(seq 1 "$MAX_NPM_ATTEMPTS"); do
    log "Installing dependencies: attempt ${attempt}/${MAX_NPM_ATTEMPTS}"

    if [ -d node_modules ]; then
      mv node_modules "node_modules.bak.$(date +%s).${attempt}" || rm -rf node_modules || true
    fi

    npm cache verify >/dev/null 2>&1 || npm cache clean --force || true

    if npm ci --no-audit --no-fund && verify_node_modules; then
      log "Dependencies installed and verified"
      return 0
    fi

    log "Dependency install failed/invalid on attempt ${attempt}"
  done

  fail "Could not install valid dependencies after ${MAX_NPM_ATTEMPTS} attempts"
}

is_valid_json_file() {
  local file="$1"
  [ -f "$file" ] || return 1
  node -e "const fs=require('fs');const p=process.argv[1];JSON.parse(fs.readFileSync(p,'utf8'));" "$file" >/dev/null 2>&1
}

restore_runtime_db_if_needed() {
  cd "$APP_DIR"

  if is_valid_json_file ".runtime-store.json" && is_valid_json_file ".hotel-search-cache.json"; then
    log "Runtime store files are valid, skipping DB restore"
    return 0
  fi

  log "Runtime store files missing/corrupted, restoring from seed"
  node scripts/restore-runtime-db-from-seed.mjs

  is_valid_json_file ".runtime-store.json" || fail "Runtime store is still invalid after restore"
}

build_app() {
  cd "$APP_DIR"
  export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB}"
  export NEXT_TELEMETRY_DISABLED=1

  log "Building app (NODE_OPTIONS=${NODE_OPTIONS})"
  npm run build

  [ -s "$APP_DIR/.next/BUILD_ID" ] || fail ".next/BUILD_ID is missing after build"
}

wait_service_active() {
  local i
  for i in $(seq 1 45); do
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      log "Service is active after ${i}s"
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_http_ok() {
  local url="$1"
  local attempts="$2"
  local sleep_sec="$3"
  local i

  for i in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 8 "$url" >/dev/null 2>&1; then
      log "HTTP health ok: ${url} (attempt ${i}/${attempts})"
      return 0
    fi
    sleep "$sleep_sec"
  done

  return 1
}

verify_dashboard_warn_only() {
  local ids
  ids=$(curl -fsS --max-time 15 "http://127.0.0.1:3100/api/hotels" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const ids=(j.items||[]).slice(0,5).map(x=>x.id).filter(Boolean);process.stdout.write(ids.join('\\n'));}catch{process.stdout.write('');}})") || true

  if [ -z "$ids" ]; then
    log "WARNING: dashboard probe skipped (no hotel ids)"
    return 0
  fi

  local id status
  for id in $ids; do
    status=$(curl -sS --max-time 10 -o /tmp/hri_dashboard_probe.json -w '%{http_code}' "http://127.0.0.1:3100/api/hotels/${id}/dashboard" || true)
    if [ "$status" = "200" ]; then
      log "Dashboard probe ok for hotel ${id}"
      return 0
    fi
  done

  log "WARNING: dashboard probe failed for sampled hotels (non-blocking)"
  head -c 300 /tmp/hri_dashboard_probe.json || true
  echo
  return 0
}

restart_and_verify() {
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"

  wait_service_active || return 1
  wait_http_ok "http://127.0.0.1:3100/api/health" 35 2 || return 1
  wait_http_ok "http://127.0.0.1:3100/api/hotels/search?q=courtyard&limit=5" 35 2 || return 1
  verify_dashboard_warn_only
}

main() {
  require_cmd git npm node curl systemctl
  acquire_lock
  assert_environment

  log "=== Deploy started ==="
  log "Memory snapshot:"
  free -m || true

  cd "$APP_DIR"
  local prev_sha
  prev_sha="$(git rev-parse --short HEAD || echo unknown)"
  log "Current commit: ${prev_sha}"

  git fetch origin main
  git pull --ff-only origin main
  log "Target commit: $(git rev-parse --short HEAD)"

  cleanup_stale_dirs
  install_deps
  build_app

  # Keep downtime minimal: stop/restart only after successful build.
  systemctl stop "$SERVICE_NAME" || true
  restore_runtime_db_if_needed

  if ! restart_and_verify; then
    log "Primary verification failed, running one self-heal cycle"
    systemctl stop "$SERVICE_NAME" || true
    restore_runtime_db_if_needed
    restart_and_verify || fail "Deployment failed after self-heal cycle"
  fi

  cleanup_stale_dirs
  log "=== Deploy finished successfully ==="
}

main "$@"
