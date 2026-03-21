# Hotel Review Intelligence

B2B SaaS foundation для управленческой аналитики отзывов в гостиничном бизнесе.

## Что реализовано в MVP
- Full product architecture (см. `docs/product-architecture.md`).
- Next.js + TypeScript + Tailwind проектная основа.
- Доменная модель: Hotel, Review, ReviewAnalysis, HotelAggregate, Recommendation, AnalysisRun.
- Explainable analytics engine:
  - preprocessing,
  - sentiment scoring,
  - topic detection,
  - probabilistic segment scoring,
  - confidence и explanation markers.
- Rule-based recommendation engine.
- Ingestion flow:
  - CSV/JSON payload,
  - validation,
  - normalization,
  - dedupe,
  - import + analysis run.
- Platform ingestion:
  - Google Places API connector (real reviews, requires API key),
  - Apify Dataset connector (high-volume multi-platform imports).
- Hotel creation flow:
  - можно создать любой отель прямо из UI (не только seed).
- Async processing UX:
  - run statuses (running/completed/failed),
  - progress/stage updates,
  - animated processing panel.
- API layer.
- UI pages:
  - Dashboard,
  - Review Explorer,
  - Segment Analysis,
  - Recommendations,
  - Methodology,
  - Upload / Analysis Run.

## Быстрый старт
Требуется Node.js 20+.

```bash
npm install
npm run dev
```

Приложение: `http://localhost:3000`.

## Переменные окружения (для real-source ingestion)
Создайте `.env.local`:

```bash
GOOGLE_PLACES_API_KEY=your_google_places_key
```

Для Apify bulk-ingestion передавайте dataset URL в UI:
`https://api.apify.com/v2/datasets/<dataset-id>/items?token=<token>`

## Структура
- `app/` - маршруты и API route handlers.
- `src/server/analytics/` - explainable analytics engine.
- `src/server/ingestion/` - upload pipeline.
- `src/server/repositories/` - repository abstraction + in-memory adapter.
- `src/features/` - экранные модули приложения.
- `src/shared/` - UI kit, utils, taxonomy/config.
- `src/data/seeds/` - стартовые данные.
- `docs/product-architecture.md` - продуктово-техническая структура A-Q.

## Ограничения MVP
- Хранилище in-memory (готово к замене на PostgreSQL repository).
- Авторизация/RBAC не включены в текущий этап.
- UI upload использует textarea-поток для ускорения MVP, в V1 добавляется файловый upload и фоновые задачи.
