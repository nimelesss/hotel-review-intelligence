#!/usr/bin/env node
/**
 * Incremental manual review import.
 *
 * Unlike the full `import-open-datasets-to-sqlite.mjs` which rebuilds from
 * scratch, this script adds new reviews to an existing runtime database
 * without deleting anything.
 *
 * Usage:
 *   node scripts/import-manual-reviews.mjs <csv-file> [--hotel-id <id>] [--dry-run]
 *
 * CSV format (header required):
 *   name,address,rubrics,rating,text,review_date,source,author
 *
 * The script:
 *   1. Reads the CSV file
 *   2. Cleans OCR artifacts from text
 *   3. Resolves hotel via canonical overrides or creates new entry
 *   4. Deduplicates against existing reviews (by text_hash + hotel_id)
 *   5. Inserts only genuinely new reviews
 *   6. Clears stale analytics so they regenerate on next dashboard access
 *   7. Updates hotel review_count in catalog
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";

// ── Paths ──────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const CANONICAL_OVERRIDES_PATH = path.resolve(
  ROOT,
  "data/open-datasets/hotel-canonical-overrides.json"
);

function getSqlitePaths() {
  const base = path.resolve(ROOT, "data/runtime");
  return {
    catalogPath:
      process.env.HOTEL_CATALOG_DB_PATH || path.join(base, "hotel_catalog.sqlite"),
    intelligencePath:
      process.env.REVIEW_INTELLIGENCE_DB_PATH || path.join(base, "review_intelligence.sqlite")
  };
}

// ── CLI args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { csvPath: null, hotelId: null, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hotel-id" && args[i + 1]) {
      opts.hotelId = args[++i];
    } else if (args[i] === "--dry-run") {
      opts.dryRun = true;
    } else if (!args[i].startsWith("--")) {
      opts.csvPath = args[i];
    }
  }

  if (!opts.csvPath) {
    console.error("Usage: node scripts/import-manual-reviews.mjs <csv-file> [--hotel-id <id>] [--dry-run]");
    console.error("");
    console.error("CSV columns: name, address, rubrics, rating, text, review_date, source, author");
    process.exit(1);
  }

  const resolved = path.resolve(ROOT, opts.csvPath);
  if (!fs.existsSync(resolved)) {
    console.error(`[import-manual] CSV file not found: ${resolved}`);
    process.exit(1);
  }

  opts.csvPath = resolved;
  return opts;
}

// ── OCR cleanup ────────────────────────────────────────────────────────────

const OCR_PATTERNS = [
  // Series of ? marks from failed OCR (e.g., ?????, ???)
  /[\?\uFFFD]{2,}/g,
  // Copyright/trademark symbols that leak from screenshot OCR
  /[©®™⁰¹²³⁴⁵⁶⁷⁸⁹]+/g,
  // Stray emojis encoded as surrogate garbage
  /[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
  // ЖЖ prefix (LiveJournal copy-paste header)
  /^ЖЖ\s+\d+\s+(дне[йя]|недел[ьи]|месяц\w*|час\w*|минут\w*)\s+назад\s*/i,
  // HTML entities
  /&[a-z]+;/gi,
  // Stray backslash escapes
  /\\[nrt]/g,
  // Zero-width and invisible Unicode chars
  /[\u200B-\u200D\uFEFF\u00AD]/g,
  // Multiple dots/ellipsis cleanup
  /\.{4,}/g
];

function cleanOcrArtifacts(text) {
  let result = text;
  for (const pattern of OCR_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  // Collapse whitespace
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

// ── Text helpers (matching existing codebase conventions) ──────────────────

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\\[nrt]/g, " ")
    .replace(/[\?\uFFFD]{3,}/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForKey(value) {
  return normalizeWhitespace(String(value || ""))
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function cleanText(text) {
  return normalizeWhitespace(
    text.toLowerCase().replace(/\s+/g, " ").trim()
  );
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeDate(value) {
  if (!value) return null;
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return null;
  return ts.toISOString();
}

function parseRating(raw) {
  const value = Number(String(raw ?? "").replace(",", ".").trim());
  if (!Number.isFinite(value)) return NaN;
  const normalized = value <= 5 ? value * 2 : value;
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 10) return NaN;
  return Math.round(normalized * 100) / 100;
}

function resolveReviewSource(rowSource) {
  const source = normalizeForKey(asString(rowSource));
  if (source.includes("2gis") || source.includes("2 гис")) return "2gis";
  if (source.includes("yandex") || source.includes("яндекс")) return "yandex";
  if (source.includes("ostrovok") || source.includes("островок")) return "ostrovok";
  if (source.includes("booking")) return "booking.com";
  if (source.includes("flamp")) return "flamp";
  if (source.includes("tripadvisor")) return "tripadvisor";
  return "manual_upload";
}

function extractCity(address) {
  if (!address) return "";
  const parts = address.split(",").map((p) => normalizeWhitespace(p)).filter(Boolean);
  if (!parts.length) return "";
  for (const part of parts) {
    if (/^г\.\s*/i.test(part)) {
      return part.replace(/^г\.\s*/i, "").trim();
    }
  }
  return parts[0].trim();
}

function inferBrand(hotelName) {
  const lower = hotelName.toLowerCase();
  if (lower.includes("courtyard")) return "Courtyard";
  if (lower.includes("marriott") || lower.includes("марриотт")) return "Marriott";
  if (lower.includes("hilton") || lower.includes("хилтон")) return "Hilton";
  if (lower.includes("radisson") || lower.includes("рэдиссон")) return "Radisson";
  if (lower.includes("azimut") || lower.includes("азимут")) return "AZIMUT";
  return "Независимый отель";
}

// ── Canonical overrides ────────────────────────────────────────────────────

function loadCanonicalOverrides() {
  if (!fs.existsSync(CANONICAL_OVERRIDES_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(CANONICAL_OVERRIDES_PATH, "utf8"));
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
    if (matchCity && matchCity !== city) return false;
    return nameMatches || addressMatches;
  });
}

// ── Main logic ─────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs();
  const canonicalOverrides = loadCanonicalOverrides();
  const paths = getSqlitePaths();

  console.log(`[import-manual] CSV: ${opts.csvPath}`);
  console.log(`[import-manual] DB:  ${paths.intelligencePath}`);
  if (opts.dryRun) console.log("[import-manual] DRY RUN — no changes will be written");

  // Read CSV
  const csvContent = fs.readFileSync(opts.csvPath, "utf8");
  const rows = parse(csvContent, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  });

  console.log(`[import-manual] Rows in CSV: ${rows.length}`);

  if (!rows.length) {
    console.log("[import-manual] No rows to import. Done.");
    return;
  }

  // Open DB
  const db = new Database(paths.intelligencePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = OFF");
  db.pragma("busy_timeout = 10000");
  db.exec(`ATTACH DATABASE '${paths.catalogPath.replace(/'/g, "''")}' AS hotel_catalog`);

  const stats = {
    csvRows: rows.length,
    processed: 0,
    inserted: 0,
    duplicates: 0,
    skippedNoText: 0,
    skippedBadRating: 0,
    ocrCleaned: 0,
    hotelsCreated: 0,
    affectedHotelIds: new Set()
  };

  // Build existing text_hash index for dedup
  const existingHashes = new Set();

  const insertReview = db.prepare(`
    INSERT OR IGNORE INTO reviews (
      id, hotel_id, source, source_review_id, review_date, rating, title, text,
      cleaned_text, language, author_name, stay_type_raw, text_hash, created_at, updated_at
    ) VALUES (
      @id, @hotel_id, @source, @source_review_id, @review_date, @rating, @title, @text,
      @cleaned_text, @language, @author_name, @stay_type_raw, @text_hash, @created_at, @updated_at
    )
  `);

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

  const now = new Date().toISOString();

  // Process rows in a transaction
  const processRows = db.transaction(() => {
    for (const row of rows) {
      stats.processed++;

      // Extract text
      let text = normalizeWhitespace(asString(row.text ?? row.review ?? ""));
      if (!text || text.length < 10) {
        stats.skippedNoText++;
        continue;
      }

      // Clean OCR artifacts
      const textBefore = text;
      text = cleanOcrArtifacts(text);
      if (text !== textBefore) stats.ocrCleaned++;

      if (text.length < 10) {
        stats.skippedNoText++;
        continue;
      }

      // Rating
      const ratingValue = parseRating(row.rating ?? row.score ?? row.stars);
      if (!Number.isFinite(ratingValue)) {
        stats.skippedBadRating++;
        continue;
      }

      // Hotel resolution
      const hotelName = normalizeWhitespace(asString(row.name_ru ?? row.name ?? row.hotelName ?? ""));
      const address = normalizeWhitespace(asString(row.address ?? row.fullAddress ?? ""));
      const rubrics = normalizeWhitespace(asString(row.rubrics ?? row.category ?? ""));
      const baseCity = extractCity(address) || "Россия";

      let hotelId = opts.hotelId;
      if (!hotelId) {
        const override = findCanonicalOverride(canonicalOverrides, {
          hotelName,
          city: baseCity,
          address
        });
        const effectiveName = override?.canonicalName || hotelName;
        const effectiveCity = override?.canonicalCity || baseCity;
        const effectiveAddress = override?.canonicalAddress || address;
        const hotelKey = `${normalizeForKey(effectiveName)}|${normalizeForKey(effectiveCity)}`;
        hotelId = override?.id || `hotel-${stableHash(hotelKey)}`;

        // Ensure hotel exists in catalog
        const existingHotel = db
          .prepare("SELECT id FROM hotel_catalog.hotels WHERE id = ?")
          .get(hotelId);
        if (!existingHotel) {
          insertHotel.run({
            id: hotelId,
            external_id: null,
            name: effectiveName,
            normalized_name: normalizeForKey(effectiveName),
            brand: inferBrand(effectiveName),
            city: effectiveCity,
            normalized_city: normalizeForKey(effectiveCity),
            country: "Россия",
            category: "3-4*",
            address: effectiveAddress || `${effectiveName}, ${effectiveCity}`,
            coordinates_lat: null,
            coordinates_lon: null,
            aliases: "[]",
            description: "Профиль создан при ручном импорте отзывов.",
            created_at: now,
            updated_at: now
          });
          stats.hotelsCreated++;
        }
      }

      // Build dedupe hash
      const cleanedText = cleanText(text);
      const textHash = stableHash(cleanedText);
      const dedupeKey = `${hotelId}|${textHash}`;

      // Check existing in DB
      if (!existingHashes.has(dedupeKey)) {
        const existing = db
          .prepare("SELECT 1 FROM reviews WHERE hotel_id = ? AND text_hash = ? LIMIT 1")
          .get(hotelId, textHash);
        if (existing) {
          existingHashes.add(dedupeKey);
        }
      }

      if (existingHashes.has(dedupeKey)) {
        stats.duplicates++;
        continue;
      }
      existingHashes.add(dedupeKey);

      // Review date
      const explicitDate = normalizeDate(asString(row.review_date ?? row.date ?? row.publishedAt ?? ""));
      const reviewDate = explicitDate || now;

      // Source
      const source = resolveReviewSource(asString(row.source ?? ""));

      // Build review row
      const sourceReviewId = stableHash(`manual|${hotelId}|${reviewDate.slice(0, 10)}|${ratingValue}|${textHash}`);
      const reviewId = `review-${stableHash(`${hotelId}|${sourceReviewId}`)}`;

      if (!opts.dryRun) {
        const result = insertReview.run({
          id: reviewId,
          hotel_id: hotelId,
          source,
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
          created_at: now,
          updated_at: now
        });
        if (result.changes > 0) {
          stats.inserted++;
          stats.affectedHotelIds.add(hotelId);
        } else {
          stats.duplicates++;
        }
      } else {
        stats.inserted++;
        stats.affectedHotelIds.add(hotelId);
      }
    }
  });

  processRows();

  // Invalidate analytics for affected hotels so ensureHotelAnalytics re-runs
  if (!opts.dryRun && stats.affectedHotelIds.size > 0) {
    console.log(`[import-manual] Invalidating analytics for ${stats.affectedHotelIds.size} hotel(s)`);
    const deleteAnalyses = db.prepare("DELETE FROM review_analyses WHERE hotel_id = ?");
    const deleteAggregates = db.prepare("DELETE FROM hotel_aggregates WHERE hotel_id = ?");
    const deleteRecommendations = db.prepare("DELETE FROM recommendations WHERE hotel_id = ?");

    const invalidate = db.transaction(() => {
      for (const hotelId of stats.affectedHotelIds) {
        deleteAnalyses.run(hotelId);
        deleteAggregates.run(hotelId);
        deleteRecommendations.run(hotelId);
      }
    });
    invalidate();

    // Update hotel review_count in catalog
    console.log("[import-manual] Updating hotel review counts");
    db.exec(`
      DROP TABLE IF EXISTS temp_manual_import_stats;
      CREATE TEMP TABLE temp_manual_import_stats AS
        SELECT hotel_id, COUNT(*) AS review_count, MAX(review_date) AS latest_review_date
        FROM reviews
        GROUP BY hotel_id;
    `);
    db.prepare(`
      UPDATE hotel_catalog.hotels
      SET
        review_count = COALESCE((
          SELECT s.review_count FROM temp_manual_import_stats s WHERE s.hotel_id = hotel_catalog.hotels.id
        ), 0),
        latest_review_date = (
          SELECT s.latest_review_date FROM temp_manual_import_stats s WHERE s.hotel_id = hotel_catalog.hotels.id
        ),
        updated_at = ?
    `).run(now);
    db.exec("DROP TABLE IF EXISTS temp_manual_import_stats");
  }

  db.close();

  // Report
  console.log("");
  console.log("═══ Import Summary ═══");
  console.log(`  CSV rows:       ${stats.csvRows}`);
  console.log(`  Processed:      ${stats.processed}`);
  console.log(`  Inserted:       ${stats.inserted}`);
  console.log(`  Duplicates:     ${stats.duplicates}`);
  console.log(`  Skipped (text): ${stats.skippedNoText}`);
  console.log(`  Skipped (rate): ${stats.skippedBadRating}`);
  console.log(`  OCR cleaned:    ${stats.ocrCleaned}`);
  console.log(`  Hotels created: ${stats.hotelsCreated}`);
  console.log(`  Hotels updated: ${stats.affectedHotelIds.size}`);
  if (opts.dryRun) {
    console.log("  ⚠ DRY RUN — nothing was written to the database");
  }
  console.log("");

  if (stats.inserted === 0) {
    console.log("[import-manual] No new reviews to insert (all duplicates or invalid).");
  } else {
    console.log(`[import-manual] Done. ${stats.inserted} new review(s) added.`);
    console.log("[import-manual] Analytics will regenerate on next dashboard access.");
    console.log("[import-manual] Run 'npm run db:snapshot-seed' to persist changes in seed.");
  }
}

main();
