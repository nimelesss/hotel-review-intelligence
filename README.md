# Hotel Review Intelligence

B2B-платформа для гостиничного менеджмента: превращает отзывы гостей в управленческую аналитику, сегменты и рекомендации.

## Что уже реализовано
- Веб-приложение на `Next.js + TypeScript + Tailwind`.
- Экран поиска: можно найти и добавить любой отель в России.
- Аналитика:
  - предобработка текстов,
  - тональность,
  - тематический анализ,
  - вероятностная сегментация,
  - explainable-обоснование.
- Dashboard с управленческой сводкой:
  - KPI,
  - драйверы позитива/негатива,
  - риски,
  - инсайты по сегментам,
  - покрытие источников по отзывам.
- Модуль загрузки:
  - ручной импорт CSV/JSON,
  - запуск сборов по площадкам,
  - прогресс-этапы и история запусков.
- Runtime-хранилище в `.runtime-store.json`.

## Российские источники отзывов
Система поддерживает провайдеры:
- `yandex_maps_dataset`
- `two_gis_dataset`
- `ostrovok_dataset`
- `russian_travel_dataset`

Провайдеры работают с JSON dataset URL, например:

```text
https://api.apify.com/v2/datasets/<dataset-id>/items?token=<token>
```

## Режимы синхронизации
1. Портфельная синхронизация (по всем отелям и таргетам).
2. Realtime-синхронизация для выбранного отеля.

### Обязательные переменные сервера
В `/etc/hotel-review-intelligence.env`:

```bash
SYNC_TRIGGER_TOKEN=replace_with_long_random_token
PORTFOLIO_SYNC_TARGETS_JSON=[{"hotelId":"hotel-courtyard-rostov","provider":"yandex_maps_dataset","datasetUrl":"https://api.apify.com/v2/datasets/<id>/items?token=<token>","limit":300}]
```

### Опционально: fallback для любого нового отеля
Если для отеля нет персональных таргетов, используется:

```bash
DEFAULT_REALTIME_TARGETS_JSON=[{"provider":"yandex_maps_dataset","datasetUrl":"https://api.apify.com/v2/datasets/<id>/items?token=<token>","limit":300},{"provider":"two_gis_dataset","datasetUrl":"https://api.apify.com/v2/datasets/<id>/items?token=<token>","limit":300},{"provider":"ostrovok_dataset","datasetUrl":"https://api.apify.com/v2/datasets/<id>/items?token=<token>","limit":300}]
```

## API
- `GET /api/hotels` — список отелей.
- `POST /api/hotels` — создать профиль отеля.
- `GET /api/hotels/search?q=...` — поиск отелей по РФ.
- `GET /api/hotels/:hotelId/dashboard` — сводка.
- `GET /api/reviews` — выборка отзывов с фильтрами.
- `POST /api/analysis-runs/from-platform` — запуск по одному провайдеру.
- `POST /api/sync/realtime-hotel` — запуск по всем доступным источникам для отеля.
- `POST /api/sync/portfolio` — портфельный запуск (требует `SYNC_TRIGGER_TOKEN`).

## Локальный запуск
Требуется `Node.js 20+`.

```bash
npm install
npm run dev
```

Открыть: `http://localhost:3000`

## Маршруты приложения
- `/` — сводка
- `/reviews` — отзывы
- `/segments` — сегменты
- `/recommendations` — рекомендации
- `/upload` — загрузка данных
- `/methodology` — методика

## Ограничения MVP
- Хранилище runtime-файловое, без PostgreSQL.
- Нет авторизации/RBAC.
- Для «реального» охвата площадок нужны корректные dataset URL и доступы к источникам.
