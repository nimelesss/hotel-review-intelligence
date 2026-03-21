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
