#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse";

const REGISTRY_PATH = path.resolve(process.cwd(), "data/open-datasets/registry.json");
const OUTPUT_PATH = path.resolve(process.cwd(), "data/open-datasets/profile-report.json");
const SAMPLE_LIMIT = Number(process.env.OPEN_DATASET_PROFILE_SAMPLE_LIMIT || 3000);

const ACCOMMODATION_MARKERS = [
  "гостиниц",
  "отель",
  "хостел",
  "апарт",
  "апартаменты",
  "гостевой дом",
  "санатор",
  "база отдыха",
  "hotel",
  "hostel",
  "resort",
  "inn"
];

async function main() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    throw new Error(`Registry not found: ${REGISTRY_PATH}`);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  const datasets = Array.isArray(registry.datasets) ? registry.datasets : [];

  const profiled = [];
  for (const dataset of datasets) {
    const profile = await profileDataset(dataset);
    profiled.push(profile);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sampleLimit: SAMPLE_LIMIT,
    datasets: profiled,
    summary: {
      total: profiled.length,
      acceptedForReviewsDb: profiled.filter((item) => item.acceptForReviewsDb).length,
      acceptedForCatalogDb: profiled.filter((item) => item.acceptForCatalogDb).length,
      rejected: profiled.filter(
        (item) => !item.acceptForReviewsDb && !item.acceptForCatalogDb
      ).length
    }
  };

  ensureDirectory(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[profile-open-datasets] saved ${OUTPUT_PATH}`);
}

async function profileDataset(dataset) {
  const localPath = path.resolve(process.cwd(), dataset.localPath || "");
  const profile = {
    id: dataset.id,
    provider: dataset.provider,
    localPath: dataset.localPath,
    exists: fs.existsSync(localPath),
    sampleRows: 0,
    columns: [],
    inferred: {
      hasReviewText: false,
      hasRating: false,
      hasReviewDate: false,
      hasHotelName: false,
      hasAddress: false,
      hasRubrics: false
    },
    sampleAccommodationShare: 0,
    acceptForReviewsDb: false,
    acceptForCatalogDb: false,
    rejectionReasons: [],
    notes: dataset.notes || ""
  };

  if (!profile.exists) {
    profile.rejectionReasons.push("Файл не найден локально.");
    return profile;
  }

  const sample = await readCsvSample(localPath, SAMPLE_LIMIT);
  profile.sampleRows = sample.rows.length;
  profile.columns = sample.columns;

  const lowerCols = sample.columns.map((col) => col.toLowerCase());
  profile.inferred.hasReviewText = hasAny(lowerCols, [
    "text",
    "review",
    "comment",
    "body",
    "отзыв"
  ]);
  profile.inferred.hasRating = hasAny(lowerCols, ["rating", "score", "stars", "label"]);
  profile.inferred.hasReviewDate = hasAny(lowerCols, [
    "date",
    "review_date",
    "published",
    "created_at",
    "timestamp"
  ]);
  profile.inferred.hasHotelName = hasAny(lowerCols, [
    "hotel",
    "name_ru",
    "hotel name",
    "property",
    "name"
  ]);
  profile.inferred.hasAddress = hasAny(lowerCols, ["address", "city", "location"]);
  profile.inferred.hasRubrics = hasAny(lowerCols, ["rubrics", "category", "type"]);

  profile.sampleAccommodationShare = calcAccommodationShare(sample.rows);

  profile.acceptForReviewsDb =
    profile.inferred.hasReviewText &&
    profile.inferred.hasHotelName &&
    (profile.inferred.hasAddress || profile.inferred.hasRubrics) &&
    profile.sampleAccommodationShare > 0.1;

  profile.acceptForCatalogDb =
    profile.inferred.hasHotelName &&
    (profile.inferred.hasAddress || profile.sampleAccommodationShare > 0.1);

  if (!profile.acceptForReviewsDb) {
    profile.rejectionReasons.push(
      "Недостаточно полей для устойчивой связки отзыв -> объект размещения."
    );
  }
  if (!profile.acceptForCatalogDb) {
    profile.rejectionReasons.push(
      "Недостаточно полей для каталога (название + адрес/локация)."
    );
  }

  return profile;
}

async function readCsvSample(filePath, limit) {
  const rows = [];
  const columns = new Set();

  const parser = parse({
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: false
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(parser);

  for await (const record of parser) {
    rows.push(record);
    Object.keys(record).forEach((column) => columns.add(column));
    if (rows.length >= limit) {
      stream.destroy();
      break;
    }
  }

  return {
    rows,
    columns: [...columns]
  };
}

function calcAccommodationShare(rows) {
  if (!rows.length) {
    return 0;
  }
  let hits = 0;
  for (const row of rows) {
    const joined = Object.values(row || {})
      .map((value) => String(value || ""))
      .join(" ")
      .toLowerCase();
    if (ACCOMMODATION_MARKERS.some((marker) => joined.includes(marker))) {
      hits += 1;
    }
  }
  return hits / rows.length;
}

function hasAny(columns, needles) {
  return needles.some((needle) => columns.some((column) => column.includes(needle)));
}

function ensureDirectory(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

main().catch((error) => {
  console.error(
    `[profile-open-datasets] failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
});
