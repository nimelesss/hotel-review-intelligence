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

function removeIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch {
    // ignore fs race conditions
  }
}

function purgeSqliteSidecars(dbPath) {
  removeIfExists(`${dbPath}-wal`);
  removeIfExists(`${dbPath}-shm`);
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

function reconcileHotelCounters() {
  const catalogPath = path.join(RUNTIME_DIR, "hotel_catalog.sqlite");
  const intelPath = path.join(RUNTIME_DIR, "review_intelligence.sqlite");
  if (!fs.existsSync(catalogPath) || !fs.existsSync(intelPath)) {
    return {
      updated: 0,
      hotelsWithReviews: 0
    };
  }

  const db = new Database(intelPath);
  const escapedCatalogPath = catalogPath.replace(/'/g, "''");
  db.exec(`ATTACH DATABASE '${escapedCatalogPath}' AS hotel_catalog`);

  db.exec(`
    DROP TABLE IF EXISTS temp_runtime_hotel_stats;
    CREATE TEMP TABLE temp_runtime_hotel_stats AS
      SELECT
        hotel_id,
        COUNT(*) AS review_count,
        MAX(review_date) AS latest_review_date
      FROM reviews
      GROUP BY hotel_id;
    CREATE INDEX IF NOT EXISTS idx_temp_runtime_hotel_stats_id
      ON temp_runtime_hotel_stats(hotel_id);
  `);

  const updated = db
    .prepare(
      `
        UPDATE hotel_catalog.hotels
        SET
          review_count = COALESCE((
            SELECT s.review_count
            FROM temp_runtime_hotel_stats s
            WHERE s.hotel_id = hotel_catalog.hotels.id
          ), 0),
          latest_review_date = (
            SELECT s.latest_review_date
            FROM temp_runtime_hotel_stats s
            WHERE s.hotel_id = hotel_catalog.hotels.id
          ),
          updated_at = ?
      `
    )
    .run(new Date().toISOString()).changes;

  const hotelsWithReviews = Number(
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM hotel_catalog.hotels WHERE COALESCE(review_count, 0) > 0`
      )
      .get()?.count || 0
  );

  db.exec(`DROP TABLE IF EXISTS temp_runtime_hotel_stats`);
  db.close();

  return {
    updated: Number(updated || 0),
    hotelsWithReviews
  };
}

function restoreFromSeed(target) {
  if (!fs.existsSync(target.seedPath)) {
    throw new Error(`Seed file not found: ${target.seedPath}`);
  }

  purgeSqliteSidecars(target.runtimePath);
  removeIfExists(target.runtimePath);

  const gz = fs.readFileSync(target.seedPath);
  const raw = zlib.gunzipSync(gz);
  const tmpPath = `${target.runtimePath}.tmp-${Date.now()}`;
  fs.writeFileSync(tmpPath, raw);
  fs.renameSync(tmpPath, target.runtimePath);
  purgeSqliteSidecars(target.runtimePath);
}

function verifyRuntimeTarget(target) {
  const db = new Database(target.runtimePath, { readonly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").all();
    const failed = integrity.some(
      (row) => String(row?.integrity_check || "").toLowerCase() !== "ok"
    );
    if (failed) {
      throw new Error(`Integrity check failed for ${target.name}`);
    }

    if (target.name === "review_intelligence") {
      const reviews = Number(db.prepare("SELECT COUNT(*) AS count FROM reviews").get()?.count || 0);
      if (reviews < QUALITY_GATES.minReviews) {
        throw new Error(
          `Quality gate failed for ${target.name}: reviews=${reviews}, expected>=${QUALITY_GATES.minReviews}`
        );
      }
      return;
    }

    if (target.name === "hotel_catalog") {
      const hotels = Number(db.prepare("SELECT COUNT(*) AS count FROM hotels").get()?.count || 0);
      if (hotels < QUALITY_GATES.minHotels) {
        throw new Error(
          `Quality gate failed for ${target.name}: hotels=${hotels}, expected>=${QUALITY_GATES.minHotels}`
        );
      }
    }
  } finally {
    db.close();
  }
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

  targets.forEach((target) => {
    verifyRuntimeTarget(target);
  });

  const reconcile = reconcileHotelCounters();
  summary.push({
    target: "hotel_catalog_counters",
    action: "reconciled",
    updatedRows: reconcile.updated,
    hotelsWithReviews: reconcile.hotelsWithReviews
  });

  const out = {
    restoredAt: new Date().toISOString(),
    summary
  };

  process.stdout.write(`${JSON.stringify(out)}\n`);
}

main();
