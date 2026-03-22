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

const QUALITY_GATES = {
  minHotels: 15_000,
  minHotelsWithReviews: 12_000,
  minReviews: 40_000,
  minReviewHotels: 12_000
};

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
      const byHotels = db.prepare("SELECT COUNT(DISTINCT hotel_id) AS count FROM reviews").get();
      db.close();
      const count = Number(row?.count || 0);
      const hotelsCount = Number(byHotels?.count || 0);
      return count < QUALITY_GATES.minReviews || hotelsCount < QUALITY_GATES.minReviewHotels;
    } catch {
      return true;
    }
  }

  if (target.name === "hotel_catalog") {
    try {
      const db = new Database(target.runtimePath, { readonly: true });
      const hotels = db.prepare("SELECT COUNT(*) AS count FROM hotels").get();
      const withReviews = db
        .prepare("SELECT COUNT(*) AS count FROM hotels WHERE COALESCE(review_count, 0) > 0")
        .get();
      db.close();
      const hotelsCount = Number(hotels?.count || 0);
      const withReviewsCount = Number(withReviews?.count || 0);
      return (
        hotelsCount < QUALITY_GATES.minHotels ||
        withReviewsCount < QUALITY_GATES.minHotelsWithReviews
      );
    } catch {
      return true;
    }
  }

  return false;
}

function validateCrossDbConsistency() {
  const catalogPath = path.join(RUNTIME_DIR, "hotel_catalog.sqlite");
  const intelPath = path.join(RUNTIME_DIR, "review_intelligence.sqlite");
  if (!fs.existsSync(catalogPath) || !fs.existsSync(intelPath)) {
    return false;
  }

  try {
    const db = new Database(intelPath, { readonly: true });
    const escapedCatalogPath = catalogPath.replace(/'/g, "''");
    db.exec(`ATTACH DATABASE '${escapedCatalogPath}' AS hotel_catalog`);

    const hotels = Number(
      db.prepare("SELECT COUNT(*) AS count FROM hotel_catalog.hotels").get()?.count || 0
    );
    const reviewHotels = Number(
      db.prepare("SELECT COUNT(DISTINCT hotel_id) AS count FROM reviews").get()?.count || 0
    );
    const missingInCatalog = Number(
      db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM (SELECT DISTINCT hotel_id FROM reviews) r
          LEFT JOIN hotel_catalog.hotels h ON h.id = r.hotel_id
          WHERE h.id IS NULL
        `
        )
        .get()?.count || 0
    );
    db.close();

    return (
      hotels >= QUALITY_GATES.minHotels &&
      reviewHotels >= QUALITY_GATES.minReviewHotels &&
      missingInCatalog === 0
    );
  } catch {
    return false;
  }
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
  const force = process.argv.includes("--force");

  const summary = [];
  targets.forEach((target) => {
    const before = fileSize(target.runtimePath);
    if (force || shouldRestore(target)) {
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

  if (!validateCrossDbConsistency()) {
    targets.forEach((target) => {
      restoreFromSeed(target);
    });
    summary.push({
      target: "cross-db-consistency",
      action: "restored_all",
      bytes: fileSize(path.join(RUNTIME_DIR, "review_intelligence.sqlite")),
      before: 0
    });
  }

  const out = {
    restoredAt: new Date().toISOString(),
    summary
  };

  process.stdout.write(`${JSON.stringify(out)}\n`);
}

main();
