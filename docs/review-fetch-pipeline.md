# Review Fetch Pipeline (MVP foundation)

This document describes the implemented runtime flow for collecting and analyzing reviews without changing the existing dashboard contracts.

## Domain storage split

1. `hotel_catalog` schema:
`hotels`, `external_profiles`
2. `review_intelligence` schema:
`reviews`, `review_analyses`, `hotel_aggregates`, `recommendations`, `analysis_runs`, `review_fetch_jobs`, `review_fetch_job_sources`

## Runtime flow

1. UI clicks `Collect reviews`.
2. `POST /api/sync/realtime-hotel` starts a typed `review_fetch_job`.
3. Job stages:
`resolving_profiles -> fetching_reviews -> normalizing_reviews -> deduping_reviews -> analyzing_reviews -> aggregating_insights -> completed`
4. Source statuses are written per source (`yandex`, `2gis`) into `review_fetch_job_sources`.
5. Final analytics are persisted through existing `upsertAnalytics` contract and consumed by dashboard as before.

## Explicit API for jobs

1. `POST /api/review-fetch-jobs`
2. `GET /api/review-fetch-jobs?hotelId=...`
3. `GET /api/review-fetch-jobs/:jobId`

These routes allow UI polling and troubleshooting without overloading `analysis_runs`.
