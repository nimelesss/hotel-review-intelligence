import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const RUNTIME_DIR = path.join(ROOT, "data", "runtime");
const SEED_DIR = path.join(ROOT, "src", "data", "seeds", "runtime-db");

const targets = [
  {
    name: "hotel_catalog",
    runtimePath: path.join(RUNTIME_DIR, "hotel_catalog.sqlite"),
    seedPath: path.join(SEED_DIR, "hotel_catalog.sqlite.gz"),
    minBytes: 1024 * 1024
  },
  {
    name: "review_intelligence",
    runtimePath: path.join(RUNTIME_DIR, "review_intelligence.sqlite"),
    seedPath: path.join(SEED_DIR, "review_intelligence.sqlite.gz"),
    minBytes: 2 * 1024 * 1024
  }
];

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function fileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function shouldRestore(target) {
  if (!fs.existsSync(target.runtimePath)) {
    return true;
  }

  const size = fileSize(target.runtimePath);
  if (size < target.minBytes) {
    return true;
  }

  if (target.name === "review_intelligence") {
    try {
      const db = new Database(target.runtimePath, { readonly: true });
      const row = db.prepare("SELECT COUNT(*) AS count FROM reviews").get();
      db.close();
      const count = Number(row?.count || 0);
      return count === 0;
    } catch {
      return true;
    }
  }

  return false;
}

function restoreFromSeed(target) {
  if (!fs.existsSync(target.seedPath)) {
    throw new Error(`Seed file not found: ${target.seedPath}`);
  }

  const gz = fs.readFileSync(target.seedPath);
  const raw = zlib.gunzipSync(gz);
  fs.writeFileSync(target.runtimePath, raw);
}

function main() {
  ensureDirectory(RUNTIME_DIR);

  const summary = [];
  targets.forEach((target) => {
    const before = fileSize(target.runtimePath);
    if (shouldRestore(target)) {
      restoreFromSeed(target);
      summary.push({
        target: target.name,
        action: "restored",
        bytes: fileSize(target.runtimePath),
        before
      });
      return;
    }

    summary.push({
      target: target.name,
      action: "kept",
      bytes: before,
      before
    });
  });

  const out = {
    restoredAt: new Date().toISOString(),
    summary
  };

  process.stdout.write(`${JSON.stringify(out)}\n`);
}

main();
