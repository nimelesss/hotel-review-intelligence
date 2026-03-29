import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export interface SqlitePaths {
  catalogPath: string;
  intelligencePath: string;
}

export function getSqlitePaths(): SqlitePaths {
  const defaultBase = path.join(process.cwd(), "data", "runtime");
  const catalogPath =
    process.env.HOTEL_CATALOG_DB_PATH ||
    path.join(defaultBase, "hotel_catalog.sqlite");
  const intelligencePath =
    process.env.REVIEW_INTELLIGENCE_DB_PATH ||
    path.join(defaultBase, "review_intelligence.sqlite");

  return {
    catalogPath,
    intelligencePath
  };
}

export function getSqliteDb(): Database.Database {
  if (db) {
    return db;
  }

  const paths = getSqlitePaths();
  ensureDirectory(paths.catalogPath);
  ensureDirectory(paths.intelligencePath);

  db = new Database(paths.intelligencePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const escapedCatalogPath = paths.catalogPath.replace(/'/g, "''");
  db.exec(`ATTACH DATABASE '${escapedCatalogPath}' AS hotel_catalog`);
  db.exec(getSchemaSql());

  return db;
}

export function resetSqliteDbSingleton() {
  if (!db) {
    return;
  }
  try {
    db.close();
  } catch {
    // ignore close errors
  } finally {
    db = null;
  }
}

function ensureDirectory(filePath: string) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
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

    CREATE TABLE IF NOT EXISTS hotel_catalog.external_profiles (
      id TEXT PRIMARY KEY,
      hotel_id TEXT NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT,
      external_uri TEXT,
      external_url TEXT,
      external_name TEXT,
      external_address TEXT,
      latitude REAL,
      longitude REAL,
      rating REAL,
      reviews_count INTEGER,
      match_confidence REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS hotel_catalog.uq_external_profiles_hotel_source
      ON external_profiles (hotel_id, source);

    CREATE INDEX IF NOT EXISTS hotel_catalog.idx_external_profiles_source
      ON external_profiles (source, updated_at DESC);

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

    CREATE INDEX IF NOT EXISTS idx_reviews_hotel_date
      ON reviews (hotel_id, review_date DESC);

    CREATE INDEX IF NOT EXISTS idx_reviews_text_hash
      ON reviews (hotel_id, text_hash);

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

    CREATE INDEX IF NOT EXISTS idx_review_analyses_hotel
      ON review_analyses (hotel_id);

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

    CREATE INDEX IF NOT EXISTS idx_recommendations_hotel
      ON recommendations (hotel_id, created_at DESC);

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

    CREATE INDEX IF NOT EXISTS idx_analysis_runs_hotel_started
      ON analysis_runs (hotel_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS review_fetch_jobs (
      id TEXT PRIMARY KEY,
      hotel_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      from_date TEXT,
      to_date TEXT,
      status TEXT NOT NULL,
      progress_pct REAL NOT NULL DEFAULT 0,
      current_stage TEXT NOT NULL,
      total_collected INTEGER NOT NULL DEFAULT 0,
      warning_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_review_fetch_jobs_hotel_created
      ON review_fetch_jobs (hotel_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS review_fetch_job_sources (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      collected_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_review_fetch_job_sources_job_source
      ON review_fetch_job_sources (job_id, source);
  `;
}
