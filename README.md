# Hotel Review Intelligence

B2B SaaS foundation for hotel management analytics from guest reviews.

## MVP Includes
- Next.js + TypeScript + Tailwind product shell
- Domain model: `Hotel`, `Review`, `ReviewAnalysis`, `HotelAggregate`, `Recommendation`, `AnalysisRun`
- Explainable analytics:
  - text preprocessing
  - sentiment scoring
  - topic detection
  - probabilistic segment scoring
  - confidence + explanation markers
- Rule-based recommendation engine
- Ingestion pipeline:
  - upload (`csv` / `json`)
  - validation
  - normalization
  - dedupe
  - import + analysis run
- Async platform runs with progress stages and animated processing UI
- Runtime persistence for created hotels/reviews/runs (`.runtime-store.json`)

## Real Review Sources (RF-focused)
Platform ingestion is configured for Russian ecosystems:
- `yandex_maps_dataset`
- `two_gis_dataset`
- `russian_travel_dataset` (mixed local aggregators)

These connectors accept dataset/export URL with paginated JSON items.  
Typical format:

```text
https://api.apify.com/v2/datasets/<dataset-id>/items?token=<token>
```

You can also use your own JSON export endpoint if it returns array-based review records.

## Hybrid Sync Strategy
The product supports both modes:
- Portfolio weekly sync (all hotels + all configured providers)
- Realtime sync for one selected hotel (fan-out across all configured providers)

### Environment config for orchestration
Set on server (`/etc/hotel-review-intelligence.env`):

```bash
SYNC_TRIGGER_TOKEN=replace_with_long_random_token
PORTFOLIO_SYNC_TARGETS_JSON=[{"hotelId":"hotel-courtyard-rostov","provider":"yandex_maps_dataset","datasetUrl":"https://api.apify.com/v2/datasets/<id>/items?token=<token>","limit":300},{"hotelId":"hotel-courtyard-rostov","provider":"two_gis_dataset","datasetUrl":"https://api.apify.com/v2/datasets/<id>/items?token=<token>","limit":300}]
```

Supported target fields:
- `hotelId` or `hotelName` (one is required)
- `provider`
- `datasetUrl`
- optional: `query`, `language`, `limit`, `enabled`

### API endpoints
- `POST /api/sync/realtime-hotel`  
  Starts fan-out sync for one hotel using configured targets.
- `POST /api/sync/portfolio`  
  Starts all-hotel sync. Requires `Authorization: Bearer <SYNC_TRIGGER_TOKEN>`.
- `GET /api/sync/portfolio`  
  Returns readiness summary. Requires the same bearer token.

## Quick Start
Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Main Pages
- `/` Dashboard
- `/reviews` Review Explorer
- `/segments` Segment Analysis
- `/recommendations` Recommendations
- `/methodology` Methodology
- `/upload` Data Upload + Analysis Run

## Deployment
Project contains GitHub Actions workflow for VPS deployment:
- `.github/workflows/deploy.yml`
- `.github/workflows/weekly-sync.yml` (weekly sync trigger)

Expected server app URL example:
- `http://<server-ip>:3100`

## Project Structure
- `app/` routes + API handlers
- `src/features/` page-level modules
- `src/shared/` UI kit, utils, config
- `src/server/analytics/` explainable analytics engine
- `src/server/ingestion/` ingestion pipeline
- `src/server/platform-fetch/` external source connectors
- `src/server/repositories/` repository abstraction + adapters
- `src/data/seeds/` seed data
- `docs/product-architecture.md` architecture spec

## Current MVP Limits
- Default storage is in-memory + runtime JSON snapshot
- No RBAC/auth in MVP
- Upload UI currently uses text payload input (file picker planned in V1)
