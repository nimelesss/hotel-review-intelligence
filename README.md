# Hotel Review Intelligence

B2B-платформа для руководителей гостиниц: собирает отзывы с площадок, строит explainable-аналитику и дает управленческие рекомендации.

## Что уже работает
- Поиск и добавление отелей по РФ (OSM/Nominatim + локальный кэш).
- Импорт национального каталога отелей в систему (`/api/catalog/sync`).
- Сбор отзывов по провайдерам (`Яндекс Карты`, `2ГИС`, `Островок`, кастомный dataset).
- Realtime-сбор по выбранному отелю (`/api/sync/realtime-hotel`).
- Недельная синхронизация (GitHub Actions `weekly-sync.yml`).
- Explainable analytics: тональность, темы, сегменты, риски, рекомендации.

## Почему бывает "0 отзывов"
Обычно не настроены источники сбора. Нужны:
1. Каталог отелей (`RUSSIA_HOTELS_CATALOG_PATH` или `RUSSIA_HOTELS_CATALOG_URL`).
2. Источники отзывов (`DEFAULT_REALTIME_TARGETS_JSON` и/или `PORTFOLIO_SYNC_TARGETS_JSON`).
3. Для сбора без `datasetUrl` нужен runtime collector (`APIFY_TOKEN` + `APIFY_ACTOR_*`).

## Быстрый запуск локально
Требуется `Node.js 20+`.

```bash
npm install
npm run dev
```

Открыть: `http://localhost:3000`

## Основные env-переменные
Смотрите шаблон: [`.env.example`](./.env.example)

Ключевые:
- `SYNC_TRIGGER_TOKEN`
- `RUSSIA_HOTELS_CATALOG_PATH`
- `DEFAULT_REALTIME_TARGETS_JSON`
- `APIFY_TOKEN`
- `APIFY_ACTOR_YANDEX_MAPS`, `APIFY_ACTOR_TWO_GIS`, `APIFY_ACTOR_OSTROVOK`

## Сбор большого каталога отелей РФ

```bash
npm run catalog:refresh -- --output data/russia-hotels-catalog.json --maxTiles 220 --limit 150000
```

Скрипт использует OpenStreetMap Overpass и сохраняет JSON-каталог с адресами/координатами.

## API
- `GET /api/hotels` — список отелей.
- `POST /api/hotels` — создать/обновить профиль отеля.
- `GET /api/hotels/search?q=...` — поиск отелей по РФ.
- `GET /api/hotels/:hotelId/dashboard` — сводная аналитика.
- `POST /api/sync/realtime-hotel` — запуск сбора для одного отеля.
- `POST /api/sync/portfolio` — портфельный запуск (требует `SYNC_TRIGGER_TOKEN`).
- `POST /api/catalog/sync` — импорт каталога (требует `SYNC_TRIGGER_TOKEN`).

## Автосинхронизация по расписанию
Файл: [`.github/workflows/weekly-sync.yml`](./.github/workflows/weekly-sync.yml)

Что делает:
1. На VPS обновляет национальный каталог отелей (`npm run catalog:refresh`).
2. Вызывает `/api/catalog/sync`.
3. Вызывает `/api/sync/portfolio` в режиме `weekly`.

## Ограничения
- Реальный охват отзывов зависит от подключенных источников (dataset URL или Apify actors).
- В MVP используется file-based runtime store; PostgreSQL можно подключить без смены API-контрактов.

## Review fetch jobs API
- `POST /api/review-fetch-jobs` - start async collection job for one hotel.
- `GET /api/review-fetch-jobs?hotelId=...` - list recent jobs and per-source status.
- `GET /api/review-fetch-jobs/:jobId` - job details with stages and source breakdown.

Realtime sync now uses staged pipeline:
`resolving_profiles -> fetching_reviews -> normalizing_reviews -> deduping_reviews -> analyzing_reviews -> aggregating_insights -> completed`.

## Seed DB snapshot without Git LFS
For large SQLite runtime DBs we store compressed snapshots in git:
- `src/data/seeds/runtime-db/hotel_catalog.sqlite.gz`
- `src/data/seeds/runtime-db/review_intelligence.sqlite.gz`

Refresh snapshots from current runtime DB:
```bash
npm run db:snapshot-seed
```

Restore runtime DB from committed snapshots:
```bash
npm run db:restore-seed
```
