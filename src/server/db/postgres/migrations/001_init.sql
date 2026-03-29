CREATE SCHEMA IF NOT EXISTS hotel_catalog;
CREATE SCHEMA IF NOT EXISTS review_intelligence;

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
  coordinates_lat DOUBLE PRECISION,
  coordinates_lon DOUBLE PRECISION,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  review_count INTEGER NOT NULL DEFAULT 0,
  latest_review_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hotels_external_id
  ON hotel_catalog.hotels (external_id)
  WHERE external_id IS NOT NULL AND external_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_hotels_name_city
  ON hotel_catalog.hotels (normalized_name, normalized_city);

CREATE INDEX IF NOT EXISTS idx_hotels_review_count
  ON hotel_catalog.hotels (review_count DESC);

CREATE TABLE IF NOT EXISTS hotel_catalog.external_profiles (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT,
  external_uri TEXT,
  external_url TEXT,
  external_name TEXT,
  external_address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  rating DOUBLE PRECISION,
  reviews_count INTEGER,
  match_confidence DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_profiles_hotel_source
  ON hotel_catalog.external_profiles (hotel_id, source);

CREATE INDEX IF NOT EXISTS idx_external_profiles_source
  ON hotel_catalog.external_profiles (source, updated_at DESC);

CREATE TABLE IF NOT EXISTS review_intelligence.reviews (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_review_id TEXT,
  review_date TIMESTAMPTZ NOT NULL,
  rating DOUBLE PRECISION NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  cleaned_text TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ru',
  author_name TEXT,
  stay_type_raw TEXT,
  text_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_source_id
  ON review_intelligence.reviews (hotel_id, source, source_review_id)
  WHERE source_review_id IS NOT NULL AND source_review_id <> '';

CREATE INDEX IF NOT EXISTS idx_reviews_hotel_date
  ON review_intelligence.reviews (hotel_id, review_date DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_text_hash
  ON review_intelligence.reviews (hotel_id, text_hash);

CREATE TABLE IF NOT EXISTS review_intelligence.review_analyses (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES review_intelligence.reviews(id) ON DELETE CASCADE,
  hotel_id TEXT NOT NULL REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  sentiment_label TEXT NOT NULL,
  sentiment_score DOUBLE PRECISION NOT NULL,
  primary_segment TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  topics JSONB NOT NULL,
  keywords JSONB NOT NULL,
  segment_scores JSONB NOT NULL,
  explanation JSONB NOT NULL,
  manager_impact JSONB NOT NULL,
  risk_flags JSONB NOT NULL,
  analyzed_at TIMESTAMPTZ NOT NULL,
  analysis_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_analyses_hotel
  ON review_intelligence.review_analyses (hotel_id);

CREATE TABLE IF NOT EXISTS review_intelligence.hotel_aggregates (
  hotel_id TEXT PRIMARY KEY REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_intelligence.recommendations (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendations_hotel
  ON review_intelligence.recommendations (hotel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_intelligence.analysis_runs (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  total_reviews_processed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  analysis_version TEXT NOT NULL,
  notes TEXT,
  progress_pct DOUBLE PRECISION,
  stage TEXT,
  error_message TEXT,
  fetched_reviews INTEGER,
  provider TEXT
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_hotel_started
  ON review_intelligence.analysis_runs (hotel_id, started_at DESC);

CREATE TABLE IF NOT EXISTS review_intelligence.review_fetch_jobs (
  id TEXT PRIMARY KEY,
  hotel_id TEXT NOT NULL REFERENCES hotel_catalog.hotels(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ,
  status TEXT NOT NULL,
  progress_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_stage TEXT NOT NULL,
  total_collected INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_fetch_jobs_hotel_created
  ON review_intelligence.review_fetch_jobs (hotel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_intelligence.review_fetch_job_sources (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES review_intelligence.review_fetch_jobs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  collected_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_review_fetch_job_sources_job_source
  ON review_intelligence.review_fetch_job_sources (job_id, source);
