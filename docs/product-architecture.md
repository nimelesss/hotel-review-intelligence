# Hotel Review Intelligence: Product & Technical Architecture (MVP -> SaaS)

## A. Product Vision
Hotel Review Intelligence - B2B SaaS-платформа для гостиничного менеджмента, которая переводит массивы отзывов гостей в управленческие решения: где улучшаем операционку, что усиливаем в маркетинге, где репутационный риск, и какие сегменты аудитории дают рост загрузки.

Ключевой принцип: система обслуживает не гостя, а управленца.

## B. User Roles
- **Owner / Investor**: смотрит KPI, риски, точки роста портфеля.
- **General Manager**: принимает операционные и сервисные решения по объекту.
- **Operations Director**: контролирует проблемы процессов (check-in, уборка, персонал).
- **Marketing Manager**: использует сильные темы и сегменты в позиционировании.
- **Reputation Manager**: отслеживает негативные драйверы и риск эскалаций.
- **Chain / Management Company Lead**: будущий multi-hotel и benchmark режим.

## C. Core Jobs-To-Be-Done
1. Быстро понять, кто доминирует среди аудиторных сегментов.
2. Понять, какие темы формируют позитив и негатив.
3. Найти репутационные риски до просадки рейтингов.
4. Получить объяснимые инсайты по конкретным отзывам.
5. Получить приоритизированные рекомендации с бизнес-обоснованием.

## D. Functional Modules
1. **Data Ingestion**: upload CSV/JSON -> validation -> normalization -> dedupe -> store.
2. **Review Processing**: preprocessing, language routing, marker extraction.
3. **Analytics Engine**: sentiment, topic tagging, segment scoring, confidence.
4. **Aggregation Layer**: hotel-level metrics, risk indicators, growth opportunities.
5. **Recommendation Engine**: explainable rule-based recommendations.
6. **API Layer**: endpoints для dashboard, explorer, segments, recommendations, runs.
7. **Web App UI**: Dashboard, Review Explorer, Segment Analysis, Recommendations, Methodology, Upload.
8. **Explainability Layer**: why classified + which markers + business interpretation.

## E. Domain Model
- **Hotel** (объект размещения)
- **Review** (сырое и нормализованное мнение гостя)
- **ReviewAnalysis** (результат анализа конкретного отзыва)
- **HotelAggregate** (агрегаты объекта)
- **Recommendation** (действие для бизнеса)
- **AnalysisRun** (пакетная обработка и ее статус)

Связи:
- `Hotel 1..* Review`
- `Review 1..1 ReviewAnalysis` (по версии анализа)
- `Hotel 1..* AnalysisRun`
- `Hotel 1..1 HotelAggregate` (на актуальную версию)
- `Hotel 1..* Recommendation`

## F. Data Model
Ниже - минимальные контрактные поля MVP (типизированы в TypeScript):

- `Hotel`: id, name, brand, city, country, category, address, coordinates?, description, createdAt, updatedAt
- `Review`: id, hotelId, source, sourceReviewId?, reviewDate, rating, title?, text, cleanedText, language, authorName?, stayTypeRaw?, createdAt, updatedAt
- `ReviewAnalysis`: id, reviewId, sentimentLabel, sentimentScore, topics[], keywords[], segmentScores{}, primarySegment, confidence, explanation[], managerImpact, riskFlags[], analyzedAt, analysisVersion
- `HotelAggregate`: id, hotelId, totalReviews, averageRating, overallSentiment, dominantSegment, segmentDistribution, topicDistribution, positiveDrivers, negativeDrivers, keyRisks, growthOpportunities, updatedAt
- `Recommendation`: id, hotelId, category, priority, title, description, rationale, relatedSegments[], relatedTopics[], impactScore, effortScore, createdAt, updatedAt
- `AnalysisRun`: id, hotelId, sourceType, totalReviewsProcessed, status, startedAt, completedAt?, analysisVersion, notes?

Storage model MVP:
- In-memory repository с интерфейсом репозитория (подменяем на PostgreSQL adapter без изменения бизнес-логики).
- Отдельное хранение `Review` (raw/normalized) и `ReviewAnalysis` (derived).
- Версионирование через `analysisVersion`.

## G. Information Architecture
- `/` -> Dashboard
- `/reviews` -> Review Explorer
- `/segments` -> Segment Analysis
- `/recommendations` -> Recommendations
- `/methodology` -> Methodology
- `/upload` -> Data Upload / Analysis Run

API:
- `GET /api/hotels`
- `GET /api/hotels/:hotelId/dashboard`
- `GET /api/reviews?hotelId=...&filters...`
- `GET /api/segments/:hotelId`
- `GET /api/recommendations/:hotelId`
- `POST /api/ingestion/preview`
- `POST /api/analysis-runs`
- `GET /api/analysis-runs?hotelId=...`

## H. Dashboard Composition
1. Executive Summary: status, last run, avg rating, volume, overall sentiment, dominant segment.
2. Audience Structure: сегменты + confidence note.
3. Positive Drivers: ranked темы, поддерживающие рейтинг.
4. Negative Drivers: ranked темы + severity.
5. Segment Insights: что ценят/критикуют по сегментам.
6. Reputation Risk: low/medium/high по темам.
7. Growth Opportunities: что можно усилить.
8. Explainable Review Cards: примеры с reason markers.
9. Recommendations Preview: top actionable items.
10. Future Readiness: roadmap note (API, multi-hotel, benchmark).

## I. Review Explorer Structure
- Фильтры: sentiment, segment, topic, source, rating range, date range, search.
- View: таблица с ключевыми колонками.
- Detail drawer/panel: полный текст, topics, segment scores, confidence, explanation.
- Состояния: loading, empty, error.

## J. Segment Analysis Structure
- Segment distribution chart.
- Segment cards: доля, avg sentiment, ключевые темы, жалобы.
- Marker transparency: какие маркеры влияют на классификацию.
- Business meaning блок по каждому сегменту.

## K. Recommendation Engine Logic
Rule-based explainable engine:
- Вход: `HotelAggregate` + распределения тем/сегментов + риск-флаги.
- Правила:
  - high business share + positive Wi-Fi/location -> marketing recommendation.
  - negative check-in with high frequency -> operations recommendation.
  - parking mixed + high mention frequency -> operations/reputation action.
  - strong cleanliness/service but weak communication usage -> marketing amplification.
- Выход: `Recommendation[]` с priority/impact/effort и rationale.

## L. Analytics Engine Logic
Pipeline:
1. Text preprocess (clean, normalize, tokenize markers).
2. Sentiment scoring (lexicon + negations + intensifiers + rating adjustment).
3. Topic detection (controlled taxonomy dictionary, multi-label).
4. Segment scoring (probabilistic weighted markers, multi-score).
5. Confidence calculation + ambiguous handling (`mixed` / `unclassified`).
6. Explainability generation (markers + data rationale + business signal).
7. Hotel-level aggregation (drivers, risks, opportunities).

MVP strategy: explainable hybrid model, не black-box.

## M. Explainability Model
Для каждого отзыва:
- `detectedMarkers`: сработавшие слова/фразы.
- `decisionPath`: как признаки повлияли на sentiment/topic/segment.
- `confidence`: числовой индекс уверенности.
- `businessInterpretation`: короткий менеджерский смысл.
- `riskFlags`: если выявлены риск-паттерны.

Разделение:
- факты: текст, рейтинг, детекты;
- вероятности: segment scores, confidence;
- действия: рекомендации.

## N. UI System
- Визуальный стиль: executive analytics, сдержанная премиальная палитра.
- Tokens: semantic colors for sentiment/risk.
- Typography: Manrope + IBM Plex Sans.
- Grid: desktop-first 12-col, mobile fallback 1-col.
- Card system: единый контейнер KPI/insight/recommendation.
- Charts: subdued colors, focus on readability; no noisy palette.
- States: skeleton/loading, empty, error, validation.
- i18n-ready text dictionary (RU-first).

## O. Tech Stack Justification
- **Next.js + React + TypeScript**: быстрый старт и масштабируемая app architecture.
- **Tailwind CSS**: строгая дизайн-система и быстрые UI-итерации.
- **Recharts**: достаточный набор chart-компонентов для MVP BI.
- **Zod**: валидируем ingestion contracts.
- **Repository pattern**: abstraction для перехода на PostgreSQL.
- **Rule-based analytics engine**: explainable и проверяемо бизнесом.

## P. Project Folder Architecture
```text
app/
  api/
  (routes pages)
src/
  entities/              # Доменные типы
  features/              # Бизнес-фичи по экранам
  widgets/               # Крупные UI-блоки
  shared/                # UI kit, utils, config
  server/
    analytics/           # Sentiment/topic/segment engines
    ingestion/           # Validate/normalize/dedupe pipeline
    repositories/        # Storage abstraction + memory adapter
    services/            # Application services (dashboard, explorer)
  data/seeds/            # Seed data
docs/
  product-architecture.md
```

## Q. Step-by-Step Implementation Plan
1. Создать каркас приложения и strict TS contracts.
2. Внедрить доменные сущности и seed data с несколькими отелями.
3. Реализовать preprocessing + sentiment + topics + segments + explainability.
4. Реализовать aggregation + recommendation engine.
5. Реализовать repository abstraction и memory adapter.
6. Реализовать API endpoints для всех MVP экранов.
7. Реализовать страницы и reusable UI widgets.
8. Добавить ingestion flow (preview/import/run status).
9. Добавить loading/empty/error states и фильтры explorer.
10. Подготовить переход на PostgreSQL и user auth (V1 readiness).
