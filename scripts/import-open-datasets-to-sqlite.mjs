#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { parse } from "csv-parse";

const REGISTRY_PATH = path.resolve(process.cwd(), "data/open-datasets/registry.json");
const PROFILE_PATH = path.resolve(process.cwd(), "data/open-datasets/profile-report.json");
const SUMMARY_PATH = path.resolve(process.cwd(), "data/open-datasets/import-summary.json");
const CANONICAL_OVERRIDES_PATH = path.resolve(
  process.cwd(),
  "data/open-datasets/hotel-canonical-overrides.json"
);

const FROM_DATE = new Date("2022-01-01T00:00:00.000Z");
const INSERT_BATCH_SIZE = Number(process.env.OPEN_DATASET_INSERT_BATCH || 2000);
const PROGRESS_EVERY_ROWS = Number(process.env.OPEN_DATASET_PROGRESS_EVERY_ROWS || 25000);
const PROGRESS_EVERY_MS = Number(process.env.OPEN_DATASET_PROGRESS_EVERY_MS || 10000);
const MAX_ROWS_PER_SOURCE = Number(process.env.OPEN_DATASET_MAX_ROWS_PER_SOURCE || 0);
const SOURCE_TIMEOUT_MS = Number(process.env.OPEN_DATASET_SOURCE_TIMEOUT_MS || 0);

const ACCOMMODATION_MARKERS = [
  "\u0433\u043e\u0441\u0442\u0438\u043d\u0438\u0446",
  "\u043e\u0442\u0435\u043b\u044c",
  "\u0445\u043e\u0441\u0442\u0435\u043b",
  "\u0430\u043f\u0430\u0440\u0442",
  "\u0430\u043f\u0430\u0440\u0442\u0430\u043c\u0435\u043d\u0442\u044b",
  "\u0433\u043e\u0441\u0442\u0435\u0432\u043e\u0439 \u0434\u043e\u043c",
  "\u0441\u0430\u043d\u0430\u0442\u043e\u0440",
  "\u0431\u0430\u0437\u0430 \u043e\u0442\u0434\u044b\u0445\u0430",
  "hotel",
  "hostel",
  "resort",
  "inn"
];

async function main() {
  const registry = readJson(REGISTRY_PATH);
  const profile = fs.existsSync(PROFILE_PATH) ? readJson(PROFILE_PATH) : null;
  const canonicalOverrides = loadCanonicalOverrides();

  const paths = getSqlitePaths();
  ensureDirectory(paths.catalogPath);
  ensureDirectory(paths.intelligencePath);

  const db = new Database(paths.intelligencePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = OFF");
  db.pragma("busy_timeout = 10000");
  db.pragma("temp_store = MEMORY");
  db.pragma("cache_size = -200000");
  db.exec(`ATTACH DATABASE '${paths.catalogPath.replace(/'/g, "''")}' AS hotel_catalog`);
  db.exec(getSchemaSql());
  dropBulkImportIndexes(db);

  const acceptedReviewSources = resolveAcceptedReviewSources(registry, profile);
  const acceptedCatalogSources = resolveAcceptedCatalogSources(registry, profile);

  const stats = {
    startedAt: new Date().toISOString(),
    fromDate: FROM_DATE.toISOString(),
    dbPaths: paths,
    acceptedReviewSources: acceptedReviewSources.map((item) => item.id),
    acceptedCatalogSources: acceptedCatalogSources.map((item) => item.id),
    sources: {},
    totals: {
      reviewsInserted: 0,
      hotelsInserted: 0,
      skippedNonAccommodation: 0,
      skippedNoText: 0,
      skippedBadRating: 0,
      skippedBadDate: 0,
      duplicates: 0
    },
    settings: {
      insertBatchSize: INSERT_BATCH_SIZE,
      progressEveryRows: PROGRESS_EVERY_ROWS,
      progressEveryMs: PROGRESS_EVERY_MS,
      maxRowsPerSource: MAX_ROWS_PER_SOURCE,
      sourceTimeoutMs: SOURCE_TIMEOUT_MS
    }
  };

  resetRuntimeTables(db);

  const insertHotel = db.prepare(`
    INSERT OR IGNORE INTO hotel_catalog.hotels (
      id, external_id, name, normalized_name, brand, city, normalized_city, country,
      category, address, coordinates_lat, coordinates_lon, aliases, description,
      review_count, latest_review_date, created_at, updated_at
    ) VALUES (
      @id, @external_id, @name, @normalized_name, @brand, @city, @normalized_city, @country,
      @category, @address, @coordinates_lat, @coordinates_lon, @aliases, @description,
      0, NULL, @created_at, @updated_at
    )
  `);

  const insertReview = db.prepare(`
    INSERT OR IGNORE INTO reviews (
      id, hotel_id, source, source_review_id, review_date, rating, title, text,
      cleaned_text, language, author_name, stay_type_raw, text_hash, created_at, updated_at
    ) VALUES (
      @id, @hotel_id, @source, @source_review_id, @review_date, @rating, @title, @text,
      @cleaned_text, @language, @author_name, @stay_type_raw, @text_hash, @created_at, @updated_at
    )
  `);

  const knownHotelIds = new Set();

  for (const source of acceptedReviewSources) {
    console.log(`[import-open-datasets] source ${source.id}: started`);
    const sourceStats = {
      rowsScanned: 0,
      reviewsInserted: 0,
      hotelsInserted: 0,
      skippedNonAccommodation: 0,
      skippedNoText: 0,
      skippedBadRating: 0,
      skippedBadDate: 0,
      duplicates: 0,
      startedAt: new Date().toISOString(),
      durationMs: 0
    };

    const localPath = path.resolve(process.cwd(), source.localPath);
    if (!fs.existsSync(localPath)) {
      sourceStats.error = `file not found: ${localPath}`;
      stats.sources[source.id] = sourceStats;
      continue;
    }

    const inferredDate = normalizeDate(
      source.snapshotDate ? `${source.snapshotDate}T00:00:00.000Z` : null
    );

    const sourceStartedAt = Date.now();
    let lastProgressLog = sourceStartedAt;
    let stopReason = null;

    let pendingHotels = [];
    let pendingReviews = [];
    const sourceNow = new Date().toISOString();

    const txInsert = db.transaction((hotelsBatch, reviewsBatch) => {
      for (const hotelRow of hotelsBatch) {
        const inserted = insertHotel.run(hotelRow);
        if (inserted.changes > 0) {
          sourceStats.hotelsInserted += 1;
        }
      }
      for (const reviewRow of reviewsBatch) {
        const inserted = insertReview.run(reviewRow);
        if (inserted.changes > 0) {
          sourceStats.reviewsInserted += 1;
        } else {
          sourceStats.duplicates += 1;
        }
      }
    });

    const flushBatch = () => {
      if (!pendingHotels.length && !pendingReviews.length) {
        return;
      }
      txInsert(pendingHotels, pendingReviews);
      pendingHotels = [];
      pendingReviews = [];
    };

    for await (const row of readCsvRows(localPath)) {
      sourceStats.rowsScanned += 1;

      if (MAX_ROWS_PER_SOURCE > 0 && sourceStats.rowsScanned > MAX_ROWS_PER_SOURCE) {
        stopReason = `maxRowsPerSource(${MAX_ROWS_PER_SOURCE}) reached`;
        break;
      }
      if (SOURCE_TIMEOUT_MS > 0 && Date.now() - sourceStartedAt > SOURCE_TIMEOUT_MS) {
        stopReason = `sourceTimeoutMs(${SOURCE_TIMEOUT_MS}) reached`;
        break;
      }

      const nowTs = Date.now();
      if (
        sourceStats.rowsScanned % PROGRESS_EVERY_ROWS === 0 ||
        nowTs - lastProgressLog >= PROGRESS_EVERY_MS
      ) {
        const elapsedSeconds = Math.max(1, Math.round((nowTs - sourceStartedAt) / 1000));
        const rate = Math.round(sourceStats.rowsScanned / elapsedSeconds);
        console.log(
          `[import-open-datasets] ${source.id}: scanned=${sourceStats.rowsScanned} insertedReviews=${sourceStats.reviewsInserted} insertedHotels=${sourceStats.hotelsInserted} skipped=${sourceStats.skippedNonAccommodation + sourceStats.skippedNoText + sourceStats.skippedBadRating + sourceStats.skippedBadDate} rate=${rate}/s`
        );
        lastProgressLog = nowTs;
      }

      const text = normalizeWhitespace(asString(row.text ?? row.review ?? ""));
      if (!text || text.length < 15) {
        sourceStats.skippedNoText += 1;
        continue;
      }

      const hotelName = normalizeWhitespace(
        asString(row.name_ru ?? row.name ?? row.hotelName ?? row["Hotel Name"] ?? "")
      );
      const address = normalizeWhitespace(asString(row.address ?? row.fullAddress ?? ""));
      const rubrics = normalizeWhitespace(asString(row.rubrics ?? row.category ?? ""));

      if (!hotelName) {
        sourceStats.skippedNonAccommodation += 1;
        continue;
      }

      if (!isAccommodation(hotelName, rubrics, address)) {
        sourceStats.skippedNonAccommodation += 1;
        continue;
      }

      const ratingValue = parseRating(row.rating ?? row.score ?? row.stars);
      if (!Number.isFinite(ratingValue)) {
        sourceStats.skippedBadRating += 1;
        continue;
      }

      const explicitDate = normalizeDate(
        asString(row.review_date ?? row.date ?? row.publishedAt ?? row.created_at ?? "")
      );
      const reviewDate = explicitDate || inferredDate || new Date().toISOString();
      if (new Date(reviewDate).getTime() < FROM_DATE.getTime()) {
        sourceStats.skippedBadDate += 1;
        continue;
      }

      const baseCity = extractCity(address) || "\u0420\u043e\u0441\u0441\u0438\u044f";
      const override = findCanonicalOverride(canonicalOverrides, {
        hotelName,
        city: baseCity,
        address
      });
      const effectiveName = override?.canonicalName || hotelName;
      const effectiveCity = override?.canonicalCity || baseCity;
      const effectiveAddress = override?.canonicalAddress || address;
      const hotelKey = `${normalizeForKey(effectiveName)}|${normalizeForKey(effectiveCity)}`;
      const hotelId = override?.id || `hotel-${stableHash(hotelKey)}`;

      if (!knownHotelIds.has(hotelId)) {
        knownHotelIds.add(hotelId);
        pendingHotels.push({
          id: hotelId,
          external_id: null,
          name: effectiveName,
          normalized_name: normalizeForKey(effectiveName),
          brand: inferBrand(effectiveName),
          city: effectiveCity,
          normalized_city: normalizeForKey(effectiveCity),
          country: "\u0420\u043e\u0441\u0441\u0438\u044f",
          category: inferCategory(effectiveName, rubrics),
          address: effectiveAddress || `${effectiveName}, ${effectiveCity}`,
          coordinates_lat: null,
          coordinates_lon: null,
          aliases: "[]",
          description: "Профиль сформирован из открытых датасетов отзывов.",
          created_at: sourceNow,
          updated_at: sourceNow
        });
      }

      const cleanedText = cleanText(text);
      const textHash = stableHash(cleanedText);
      const reviewKey = `${source.id}|${hotelId}|${reviewDate.slice(0, 10)}|${ratingValue}|${textHash}`;
      const sourceReviewId = stableHash(reviewKey);
      const reviewId = `review-${stableHash(`${hotelId}|${sourceReviewId}`)}`;
      pendingReviews.push({
        id: reviewId,
        hotel_id: hotelId,
        source: resolveReviewSource(row.source, source.id),
        source_review_id: sourceReviewId,
        review_date: reviewDate,
        rating: ratingValue,
        title: null,
        text,
        cleaned_text: cleanedText,
        language: "ru",
        author_name: normalizeWhitespace(asString(row.author ?? row.author_name ?? "")) || null,
        stay_type_raw: rubrics || null,
        text_hash: textHash,
        created_at: sourceNow,
        updated_at: sourceNow
      });

      if (pendingReviews.length >= INSERT_BATCH_SIZE) {
        flushBatch();
      }
    }

    flushBatch();
    sourceStats.durationMs = Date.now() - sourceStartedAt;
    if (stopReason) {
      sourceStats.stopReason = stopReason;
    }
    console.log(
      `[import-open-datasets] source ${source.id}: done scanned=${sourceStats.rowsScanned} reviews=${sourceStats.reviewsInserted} hotels=${sourceStats.hotelsInserted} duration=${formatDuration(sourceStats.durationMs)}`
    );

    stats.sources[source.id] = sourceStats;
    stats.totals.reviewsInserted += sourceStats.reviewsInserted;
    stats.totals.hotelsInserted += sourceStats.hotelsInserted;
    stats.totals.skippedNonAccommodation += sourceStats.skippedNonAccommodation;
    stats.totals.skippedNoText += sourceStats.skippedNoText;
    stats.totals.skippedBadRating += sourceStats.skippedBadRating;
    stats.totals.skippedBadDate += sourceStats.skippedBadDate;
    stats.totals.duplicates += sourceStats.duplicates;
  }

  // Очистка артефактов прошлых запусков аналитики.
  db.prepare(`DELETE FROM review_analyses`).run();
  db.prepare(`DELETE FROM recommendations`).run();
  db.prepare(`DELETE FROM hotel_aggregates`).run();
  db.prepare(`DELETE FROM analysis_runs`).run();

  console.log("[import-open-datasets] rebuilding hotel aggregates");
  db.exec(`
    DROP TABLE IF EXISTS temp_hotel_review_stats;
    CREATE TEMP TABLE temp_hotel_review_stats AS
      SELECT
        hotel_id,
        COUNT(*) AS review_count,
        MAX(review_date) AS latest_review_date
      FROM reviews
      GROUP BY hotel_id;
    CREATE INDEX IF NOT EXISTS idx_temp_hotel_review_stats_id
      ON temp_hotel_review_stats(hotel_id);
  `);

  db.prepare(
    `
      UPDATE hotel_catalog.hotels
      SET
        review_count = COALESCE((
          SELECT s.review_count
          FROM temp_hotel_review_stats s
          WHERE s.hotel_id = hotel_catalog.hotels.id
        ), 0),
        latest_review_date = (
          SELECT s.latest_review_date
          FROM temp_hotel_review_stats s
          WHERE s.hotel_id = hotel_catalog.hotels.id
        ),
        updated_at = ?
    `
  ).run(new Date().toISOString());

  db.prepare(
    `DELETE FROM hotel_catalog.hotels WHERE id NOT IN (SELECT hotel_id FROM temp_hotel_review_stats)`
  ).run();
  db.prepare(`DELETE FROM reviews WHERE hotel_id NOT IN (SELECT id FROM hotel_catalog.hotels)`).run();
  db.exec(`DROP TABLE IF EXISTS temp_hotel_review_stats`);

  const remainingHotels = db
    .prepare(`SELECT COUNT(*) AS count FROM hotel_catalog.hotels`)
    .get().count;
  const remainingReviews = db.prepare(`SELECT COUNT(*) AS count FROM reviews`).get().count;
  stats.totals.hotelsInDb = Number(remainingHotels || 0);
  stats.totals.reviewsInDb = Number(remainingReviews || 0);
  stats.finishedAt = new Date().toISOString();
  console.log("[import-open-datasets] creating indexes");
  createBulkImportIndexes(db);

  ensureDirectory(SUMMARY_PATH);
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(stats, null, 2), "utf8");
  db.close();

  console.log(`[import-open-datasets] catalog hotels=${stats.totals.hotelsInDb}`);
  console.log(`[import-open-datasets] reviews=${stats.totals.reviewsInDb}`);
  console.log(`[import-open-datasets] summary -> ${SUMMARY_PATH}`);
}

function dropBulkImportIndexes(db) {
  db.exec(`
    DROP INDEX IF EXISTS idx_reviews_hotel_date;
    DROP INDEX IF EXISTS idx_reviews_text_hash;
    DROP INDEX IF EXISTS uq_reviews_source_id;
    DROP INDEX IF EXISTS hotel_catalog.idx_hotels_review_count;
  `);
}

function createBulkImportIndexes(db) {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_source_id
      ON reviews (hotel_id, source, source_review_id)
      WHERE source_review_id IS NOT NULL AND source_review_id <> '';

    CREATE INDEX IF NOT EXISTS idx_reviews_hotel_date
      ON reviews (hotel_id, review_date DESC);

    CREATE INDEX IF NOT EXISTS idx_reviews_text_hash
      ON reviews (hotel_id, text_hash);

    CREATE INDEX IF NOT EXISTS hotel_catalog.idx_hotels_review_count
      ON hotels (review_count DESC);
  `);
}

function resolveAcceptedReviewSources(registry, profile) {
  const datasets = Array.isArray(registry.datasets) ? registry.datasets : [];
  if (!profile?.datasets) {
    return datasets.filter((item) => Array.isArray(item.role) && item.role.includes("reviews"));
  }

  const acceptedIds = new Set(
    profile.datasets
      .filter((item) => item.acceptForReviewsDb)
      .map((item) => item.id)
  );
  return datasets.filter((item) => acceptedIds.has(item.id));
}

function resolveAcceptedCatalogSources(registry, profile) {
  const datasets = Array.isArray(registry.datasets) ? registry.datasets : [];
  if (!profile?.datasets) {
    return datasets.filter((item) => Array.isArray(item.role) && item.role.includes("catalog"));
  }
  const acceptedIds = new Set(
    profile.datasets
      .filter((item) => item.acceptForCatalogDb)
      .map((item) => item.id)
  );
  return datasets.filter((item) => acceptedIds.has(item.id));
}

function loadCanonicalOverrides() {
  if (!fs.existsSync(CANONICAL_OVERRIDES_PATH)) {
    return [];
  }

  const raw = readJson(CANONICAL_OVERRIDES_PATH);
  return Array.isArray(raw) ? raw : [];
}

function findCanonicalOverride(overrides, input) {
  const hotelName = normalizeForKey(input.hotelName);
  const city = normalizeForKey(input.city);
  const address = normalizeForKey(input.address);

  return overrides.find((override) => {
    const match = override?.match || {};
    const matchCity = normalizeForKey(match.city || "");
    const nameMatches = Array.isArray(match.names)
      ? match.names.some((item) => normalizeForKey(item) === hotelName)
      : false;
    const addressMatches = Array.isArray(match.addresses)
      ? match.addresses.some((item) => normalizeForKey(item) === address)
      : false;

    if (matchCity && matchCity !== city) {
      return false;
    }

    return nameMatches || addressMatches;
  });
}

async function* readCsvRows(filePath) {
  const parser = parse({
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  });
  const stream = fs.createReadStream(filePath);
  stream.pipe(parser);
  for await (const row of parser) {
    yield row;
  }
}

function resetRuntimeTables(db) {
  db.prepare(`DELETE FROM reviews`).run();
  db.prepare(`DELETE FROM review_analyses`).run();
  db.prepare(`DELETE FROM hotel_aggregates`).run();
  db.prepare(`DELETE FROM recommendations`).run();
  db.prepare(`DELETE FROM analysis_runs`).run();
  db.prepare(`DELETE FROM hotel_catalog.hotels`).run();
}

function isAccommodation(hotelName, rubrics, address) {
  const haystack = `${hotelName} ${rubrics} ${address}`.toLowerCase();
  return ACCOMMODATION_MARKERS.some((marker) => haystack.includes(marker));
}

function parseRating(raw) {
  const value = Number(String(raw ?? "").replace(",", ".").trim());
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const normalized = value <= 5 ? value * 2 : value;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 10) {
    return NaN;
  }
  return Math.round(normalized * 100) / 100;
}

function resolveReviewSource(rowSource, datasetId) {
  const source = normalizeForKey(asString(rowSource));
  const dataset = normalizeForKey(asString(datasetId));

  if (source.includes("2gis") || source.includes("2 \u0433\u0438\u0441") || dataset.includes("2gis")) {
    return "2gis";
  }
  if (source.includes("yandex") || source.includes("\u044f\u043d\u0434\u0435\u043a\u0441") || dataset.includes("yandex")) {
    return "yandex";
  }
  if (source.includes("ostrovok") || dataset.includes("ostrovok")) {
    return "ostrovok";
  }

  return "manual_upload";
}

function extractCity(address) {
  if (!address) {
    return "";
  }
  const parts = address
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
  if (!parts.length) {
    return "";
  }

  // "г. Казань" -> "Казань"
  for (const part of parts) {
    if (/^г\.\s*/i.test(part)) {
      return normalizeCityLabel(part.replace(/^г\.\s*/i, ""));
    }
  }

  const first = parts[0];
  if (!isRegionPart(first)) {
    return normalizeCityLabel(first);
  }

  const cityCandidate = parts.find((part, index) => index > 0 && !isStreetPart(part));
  return normalizeCityLabel(cityCandidate || first);
}

function cleanOcrArtifacts(text) {
  return text
    .replace(/[\?\uFFFD]{2,}/g, " ")
    .replace(/[©®™]+/g, " ")
    .replace(/^ЖЖ\s+\d+\s+(дне[йя]|недел[ьи]|месяц\w*|час\w*|минут\w*)\s+назад\s*/i, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\.{4,}/g, "...");
}

function cleanText(text) {
  return normalizeWhitespace(
    cleanOcrArtifacts(text)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );
}

function inferBrand(hotelName) {
  const lower = hotelName.toLowerCase();
  if (lower.includes("courtyard")) return "Courtyard";
  if (lower.includes("marriott")) return "Marriott";
  if (lower.includes("hilton")) return "Hilton";
  if (lower.includes("radisson")) return "Radisson";
  if (lower.includes("azimut")) return "AZIMUT";
  return "Независимый отель";
}

function inferCategory(hotelName, rubrics) {
  const text = `${hotelName} ${rubrics}`.toLowerCase();
  if (text.includes("хостел") || text.includes("hostel")) {
    return "2-3*";
  }
  if (text.includes("апарт")) {
    return "3-4*";
  }
  return "3-4*";
}

function normalizeForKey(value) {
  return normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\\[nrt]/g, " ")
    .replace(/[\?\uFFFD]{3,}/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRegionPart(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text.includes("область") ||
    text.includes("край") ||
    text.includes("республика") ||
    text.includes("автономный округ") ||
    text.includes("автономная область")
  );
}

function isStreetPart(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) {
    return true;
  }
  return (
    text.includes("район") ||
    text.includes("улица") ||
    text.includes("проспект") ||
    text.includes("бульвар") ||
    text.includes("переулок") ||
    text.includes("проезд") ||
    text.includes("шоссе") ||
    text.includes("набережная") ||
    text.includes("км") ||
    /^д\.\s*\d+/i.test(text) ||
    /^\d+/.test(text)
  );
}

function normalizeCityLabel(value) {
  return normalizeWhitespace(value)
    .replace(/^муниципальное образование\s+/i, "")
    .replace(/^городской округ\s+/i, "")
    .replace(/^пос[её]лок городского типа\s+/i, "")
    .replace(/^пос[её]лок\s+/i, "")
    .replace(/^посёлок\s+/i, "")
    .replace(/^село\s+/i, "")
    .replace(/^станица\s+/i, "")
    .replace(/^деревня\s+/i, "")
    .trim();
}

function asString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) {
    return null;
  }
  return ts.toISOString();
}

function stableHash(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function getSqlitePaths() {
  const base = path.resolve(process.cwd(), "data/runtime");
  return {
    catalogPath:
      process.env.HOTEL_CATALOG_DB_PATH ||
      path.join(base, "hotel_catalog.sqlite"),
    intelligencePath:
      process.env.REVIEW_INTELLIGENCE_DB_PATH ||
      path.join(base, "review_intelligence.sqlite")
  };
}

function getSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS hotel_catalog.hotels (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'Независимый отель',
      city TEXT NOT NULL,
      normalized_city TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Россия',
      category TEXT NOT NULL DEFAULT '3*',
      address TEXT NOT NULL,
      coordinates_lat REAL,
      coordinates_lon REAL,
      aliases TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      review_count INTEGER NOT NULL DEFAULT 0,
      latest_review_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS hotel_catalog.uq_hotels_external_id
      ON hotels (external_id)
      WHERE external_id IS NOT NULL AND external_id <> '';

    CREATE UNIQUE INDEX IF NOT EXISTS hotel_catalog.uq_hotels_name_city
      ON hotels (normalized_name, normalized_city);

    CREATE INDEX IF NOT EXISTS hotel_catalog.idx_hotels_review_count
      ON hotels (review_count DESC);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      hotel_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_review_id TEXT,
      review_date TEXT NOT NULL,
      rating REAL NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      cleaned_text TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ru',
      author_name TEXT,
      stay_type_raw TEXT,
      text_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_source_id
      ON reviews (hotel_id, source, source_review_id)
      WHERE source_review_id IS NOT NULL AND source_review_id <> '';

    CREATE TABLE IF NOT EXISTS review_analyses (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL UNIQUE,
      hotel_id TEXT NOT NULL,
      sentiment_label TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      primary_segment TEXT NOT NULL,
      confidence REAL NOT NULL,
      topics TEXT NOT NULL,
      keywords TEXT NOT NULL,
      segment_scores TEXT NOT NULL,
      explanation TEXT NOT NULL,
      manager_impact TEXT NOT NULL,
      risk_flags TEXT NOT NULL,
      analyzed_at TEXT NOT NULL,
      analysis_version TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hotel_aggregates (
      hotel_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      hotel_id TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      hotel_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      total_reviews_processed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      analysis_version TEXT NOT NULL,
      notes TEXT,
      progress_pct REAL,
      stage TEXT,
      error_message TEXT,
      fetched_reviews INTEGER,
      provider TEXT
    );
  `;
}

main().catch((error) => {
  console.error(
    `[import-open-datasets] failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
});
