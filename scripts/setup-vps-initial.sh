#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Initial VPS setup for Hotel Review Intelligence.
#
# Run ONCE on a fresh server:
#   bash scripts/setup-vps-initial.sh
#
# Prerequisites:
#   - Ubuntu/Debian server with root access
#   - Git installed
#   - The repo cloned to /srv/hotel-review-intelligence
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

APP_DIR="/srv/hotel-review-intelligence"
SERVICE_NAME="hotel-review-intelligence"
APP_PORT=3100
NODE_MAJOR=22

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

# ── Node.js ─────────────────────────────────────────────────────────────────

install_node() {
  if command -v node >/dev/null 2>&1; then
    local ver
    ver="$(node --version | sed 's/v//' | cut -d. -f1)"
    if [ "$ver" -ge "$NODE_MAJOR" ]; then
      log "Node.js $(node --version) already installed"
      return 0
    fi
  fi

  log "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  log "Node.js $(node --version) installed"
}

# ── System dependencies ─────────────────────────────────────────────────────

install_deps() {
  log "Installing system dependencies"
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    build-essential python3 git curl nginx certbot python3-certbot-nginx
}

# ── Clone / prepare app ────────────────────────────────────────────────────

setup_app() {
  if [ ! -d "$APP_DIR/.git" ]; then
    log "Cloning repository"
    git clone https://github.com/nimelesss/hotel-review-intelligence.git "$APP_DIR"
  else
    log "Repository already exists at $APP_DIR"
  fi

  cd "$APP_DIR"
  git checkout main
  git pull --ff-only origin main || true

  log "Installing npm dependencies"
  npm ci --no-audit --no-fund

  log "Restoring runtime databases from seed"
  node scripts/restore-runtime-db-from-seed.mjs

  log "Building application"
  export NODE_OPTIONS="--max-old-space-size=1536"
  export NEXT_TELEMETRY_DISABLED=1
  npm run build
}

# ── Systemd service ─────────────────────────────────────────────────────────

install_service() {
  log "Installing systemd service"
  cp "$APP_DIR/hotel-review-intelligence.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  log "Service $SERVICE_NAME started"
}

# ── Nginx reverse proxy ────────────────────────────────────────────────────

setup_nginx() {
  log "Configuring nginx reverse proxy on port 80 → ${APP_PORT}"

  cat > /etc/nginx/sites-available/hotel-review-intelligence <<NGINX_EOF
server {
    listen 80;
    server_name _;

    # Do NOT conflict with other projects — match only /hri paths and API
    location /hri/ {
        proxy_pass http://127.0.0.1:${APP_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 120s;
    }
}
NGINX_EOF

  # Only enable if no default site conflicts with titanit project
  if [ ! -f /etc/nginx/sites-enabled/hotel-review-intelligence ]; then
    ln -sf /etc/nginx/sites-available/hotel-review-intelligence /etc/nginx/sites-enabled/
  fi

  nginx -t && systemctl reload nginx
  log "Nginx configured"
}

# ── Firewall ────────────────────────────────────────────────────────────────

setup_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    ufw allow ${APP_PORT}/tcp comment "Hotel Review Intelligence" 2>/dev/null || true
    log "Firewall rule added for port ${APP_PORT}"
  fi
}

# ── Verify ──────────────────────────────────────────────────────────────────

verify() {
  log "Waiting for service to start..."
  sleep 5

  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "Service is running"
  else
    log "WARNING: Service not active yet"
    journalctl -u "$SERVICE_NAME" -n 20 --no-pager
  fi

  if curl -fsS --max-time 10 "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    log "Health check passed"
  else
    log "WARNING: Health check failed (service may still be starting)"
  fi

  log ""
  log "═══════════════════════════════════════════════════════"
  log "  Hotel Review Intelligence is available at:"
  log "    Direct:  http://83.136.235.103:${APP_PORT}"
  log "    Proxy:   http://83.136.235.103/hri/"
  log "═══════════════════════════════════════════════════════"
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
  log "=== Initial VPS setup started ==="
  install_deps
  install_node
  setup_app
  install_service
  setup_firewall
  setup_nginx
  verify
  log "=== Initial VPS setup complete ==="
}

main "$@"
