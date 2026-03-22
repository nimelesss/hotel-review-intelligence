"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnalysisRun,
  AnalysisRunSourceType,
  CreateHotelRequest,
  Hotel,
  IngestionPreviewResult,
  PlatformProvider
} from "@/entities/types";
import { formatDate } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/page-header";
import { Select } from "@/shared/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/states";
import { Textarea } from "@/shared/ui/textarea";
import { AnalysisProgress } from "@/shared/ui/analysis-progress";

interface HotelListResponse {
  items: Hotel[];
}

interface RunsResponse {
  items: AnalysisRun[];
}

interface SyncResultResponse {
  result: {
    targetsStarted: number;
    runs: AnalysisRun[];
    warnings: string[];
  };
}

function presentRunSource(run: AnalysisRun): string {
  const source = (run.provider || run.sourceType) as string;
  switch (source) {
    case "yandex_maps_dataset":
      return "Яндекс Карты";
    case "two_gis_dataset":
      return "2ГИС / Flamp";
    case "ostrovok_dataset":
      return "Островок";
    case "russian_travel_dataset":
      return "Комбинированный набор площадок";
    case "apify_dataset":
      return "Dataset connector";
    default:
      return source;
  }
}

const SAMPLE_CSV = `source,sourceReviewId,reviewDate,rating,title,text,language,authorName,stayTypeRaw
booking.com,new-101,2026-03-10,8.6,Командировка,"Быстрое заселение, стабильный Wi-Fi, удобно работать за столом.",ru,Иван,Business
yandex,new-102,2026-03-12,6.4,,\"Парковка перегружена, на ресепшн была очередь.\",ru,Мария,Transit`;

export function UploadPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [fileType, setFileType] = useState<"csv" | "json">("csv");
  const [sourceType, setSourceType] = useState<AnalysisRunSourceType>("csv");
  const [payloadText, setPayloadText] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState<IngestionPreviewResult | null>(null);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [newHotel, setNewHotel] = useState<CreateHotelRequest>({
    name: "",
    city: "",
    country: "Россия",
    brand: "",
    category: "4*",
    address: "",
    description: ""
  });

  const [platformProvider, setPlatformProvider] =
    useState<PlatformProvider>("yandex_maps_dataset");
  const [platformQuery, setPlatformQuery] = useState("");
  const [platformLimit, setPlatformLimit] = useState("120");
  const [datasetUrl, setDatasetUrl] = useState("");

  useEffect(() => {
    void loadHotels();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      return;
    }
    void loadRuns(selectedHotelId);
  }, [selectedHotelId]);

  useEffect(() => {
    if (!selectedHotelId) {
      return;
    }
    const hasRunning = runs.some((run) => run.status === "running");
    if (!hasRunning) {
      return;
    }

    const interval = setInterval(() => {
      void loadRuns(selectedHotelId);
    }, 2500);
    return () => clearInterval(interval);
  }, [runs, selectedHotelId]);

  const activeRun = useMemo(
    () =>
      runs.find((run) => run.id === activeRunId) ||
      runs.find((run) => run.status === "running") ||
      null,
    [runs, activeRunId]
  );

  async function loadHotels() {
    try {
      const hotelsResponse = await fetchJson<HotelListResponse>("/api/hotels");
      setHotels(hotelsResponse.items);
      setSelectedHotelId((prev) =>
        hotelsResponse.items.some((hotel) => hotel.id === prev) ? prev : ""
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить отели.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns(hotelId: string) {
    try {
      const response = await fetchJson<RunsResponse>(`/api/analysis-runs?hotelId=${hotelId}`);
      setRuns(response.items);
      if (!activeRunId && response.items[0]) {
        setActiveRunId(response.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить историю запусков.");
    }
  }

  const onCreateHotel = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetchJson<{ item: Hotel }>("/api/hotels", {
        method: "POST",
        body: JSON.stringify(newHotel)
      });
      setHotels((prev) => [response.item, ...prev.filter((item) => item.id !== response.item.id)]);
      setSelectedHotelId(response.item.id);
      setMessage(`Профиль создан: ${response.item.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать профиль.");
    } finally {
      setBusy(false);
    }
  };

  const onPreview = async () => {
    if (!selectedHotelId) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetchJson<IngestionPreviewResult>("/api/ingestion/preview", {
        method: "POST",
        body: JSON.stringify({
          hotelId: selectedHotelId,
          sourceType,
          fileType,
          payload: payloadText
        })
      });
      setPreview(response);
      setMessage("Предпросмотр завершен.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка предпросмотра.");
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (!selectedHotelId) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetchJson<{
        preview: IngestionPreviewResult;
        run: AnalysisRun;
      }>("/api/analysis-runs", {
        method: "POST",
        body: JSON.stringify({
          hotelId: selectedHotelId,
          sourceType,
          fileType,
          payload: payloadText
        })
      });
      setPreview(response.preview);
      setRuns((prev) => [response.run, ...prev.filter((run) => run.id !== response.run.id)]);
      setActiveRunId(response.run.id);
      setMessage(`Импорт завершен. Обработано отзывов: ${response.run.totalReviewsProcessed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка импорта.");
    } finally {
      setBusy(false);
    }
  };

  const onPlatformAnalyze = async () => {
    if (!selectedHotelId) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetchJson<{ run: AnalysisRun }>("/api/analysis-runs/from-platform", {
        method: "POST",
        body: JSON.stringify({
          hotelId: selectedHotelId,
          provider: platformProvider,
          query: platformQuery,
          limit: Number(platformLimit || 120),
          language: "ru",
          datasetUrl: datasetUrl.trim()
        })
      });
      setRuns((prev) => [response.run, ...prev.filter((item) => item.id !== response.run.id)]);
      setActiveRunId(response.run.id);
      setMessage("Запуск принят. Сбор и обработка выполняются в фоне.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить сбор.");
    } finally {
      setBusy(false);
    }
  };

  const onRealtimeAllPlatforms = async () => {
    if (!selectedHotelId) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetchJson<SyncResultResponse>("/api/sync/realtime-hotel", {
        method: "POST",
        body: JSON.stringify({
          hotelId: selectedHotelId
        })
      });
      const newRuns = response.result.runs ?? [];
      if (newRuns.length) {
        setRuns((prev) => {
          const map = new Map(prev.map((run) => [run.id, run]));
          newRuns.forEach((run) => map.set(run.id, run));
          return [...map.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        });
        setActiveRunId(newRuns[0].id);
      }
      const warningText = response.result.warnings.length
        ? ` Предупреждения: ${response.result.warnings.join(" | ")}`
        : "";
      setMessage(`Запущен мультисбор: ${response.result.targetsStarted} источника(ов).${warningText}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить мультисбор.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Подготавливаю модуль загрузки..." />;
  }

  if (error && !hotels.length) {
    return <ErrorState title="Ошибка модуля загрузки" description={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Загрузка данных"
        subtitle="Создайте профиль отеля, выполните сбор отзывов и контролируйте статус обработки."
        badge="Ingestion"
      />

      <Card className="anim-delay-1">
        <CardTitle
          title="1) Создать профиль отеля"
          subtitle="Если отеля нет в системе, создайте его вручную."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            placeholder="Название отеля"
            value={newHotel.name}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <Input
            placeholder="Город"
            value={newHotel.city}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, city: event.target.value }))
            }
          />
          <Input
            placeholder="Страна"
            value={newHotel.country}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, country: event.target.value }))
            }
          />
          <Input
            placeholder="Бренд (необязательно)"
            value={newHotel.brand}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, brand: event.target.value }))
            }
          />
          <Input
            placeholder="Категория (4*, 5*)"
            value={newHotel.category}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, category: event.target.value }))
            }
          />
          <Input
            placeholder="Адрес (необязательно)"
            value={newHotel.address}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, address: event.target.value }))
            }
          />
          <Input
            className="md:col-span-2 xl:col-span-3"
            placeholder="Описание (необязательно)"
            value={newHotel.description}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </div>
        <div className="mt-3">
          <Button onClick={onCreateHotel} disabled={busy || !newHotel.name || !newHotel.city}>
            Создать профиль
          </Button>
        </div>
      </Card>

      <Card className="anim-delay-2">
        <CardTitle
          title="2) Сбор с площадок"
          subtitle="Запуск по одному источнику или мультисбор по всем настроенным источникам."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            value={selectedHotelId}
            onChange={(event) => setSelectedHotelId(event.target.value)}
          >
            <option value="">Выберите отель</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </Select>

          <Select
            value={platformProvider}
            onChange={(event) => setPlatformProvider(event.target.value as PlatformProvider)}
          >
            <option value="yandex_maps_dataset">Яндекс Карты</option>
            <option value="two_gis_dataset">2ГИС / Flamp</option>
            <option value="ostrovok_dataset">Островок</option>
            <option value="russian_travel_dataset">Комбинированный набор площадок</option>
            <option value="apify_dataset">Dataset connector</option>
          </Select>

          <Input
            placeholder="Поисковая подпись (отель + город)"
            value={platformQuery}
            onChange={(event) => setPlatformQuery(event.target.value)}
          />

          <Input
            placeholder="Максимум отзывов"
            value={platformLimit}
            onChange={(event) => setPlatformLimit(event.target.value)}
          />

          <Input
            className="md:col-span-2 xl:col-span-4"
            placeholder="Dataset URL: https://api.apify.com/v2/datasets/<id>/items?token=..."
            value={datasetUrl}
            onChange={(event) => setDatasetUrl(event.target.value)}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onPlatformAnalyze} disabled={busy || !selectedHotelId || !datasetUrl.trim()}>
            Запустить сбор по выбранному источнику
          </Button>
          <Button variant="secondary" onClick={onRealtimeAllPlatforms} disabled={busy || !selectedHotelId}>
            Запустить мультисбор по всем источникам
          </Button>
          <Badge variant="info">пайплайн: сбор → нормализация → дедупликация → анализ</Badge>
        </div>
        <p className="mt-2 text-xs text-textMuted">
          Для одиночного запуска укажите provider + dataset URL. Для мультисбора используются источники из серверной конфигурации.
        </p>
      </Card>

      <AnalysisProgress run={activeRun} className="anim-delay-3" />

      <Card>
        <CardTitle
          title="3) Ручной импорт CSV/JSON"
          subtitle="Альтернативный путь для выгрузок из PMS/CRM/OTA."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            value={selectedHotelId}
            onChange={(event) => setSelectedHotelId(event.target.value)}
          >
            <option value="">Выберите отель</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </Select>
          <Select
            value={fileType}
            onChange={(event) => setFileType(event.target.value as "csv" | "json")}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </Select>
          <Select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as AnalysisRunSourceType)}
          >
            <option value="csv">csv</option>
            <option value="json">json</option>
            <option value="mock_api">mock_api</option>
            <option value="seed">seed</option>
          </Select>
          <div className="flex gap-2">
            <Button onClick={onPreview} disabled={busy}>
              Предпросмотр
            </Button>
            <Button variant="secondary" onClick={onImport} disabled={busy}>
              Импорт и анализ
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <Textarea
            rows={10}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
          />
        </div>
      </Card>

      {message ? <Badge variant="success">{message}</Badge> : null}
      {error ? <ErrorState title="Операция не выполнена" description={error} /> : null}

      {preview ? (
        <Card>
          <CardTitle title="Предпросмотр качества данных" subtitle="Проверка перед импортом." />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Строк: {preview.totalRows}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Валидных: {preview.validRows}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Дубликатов: {preview.duplicates}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Ошибок: {preview.issues.length}
            </div>
          </div>
          {preview.issues.length > 0 ? (
            <div className="mt-4 space-y-2">
              {preview.issues.slice(0, 8).map((issue, index) => (
                <div
                  key={`${issue.row}-${issue.field}-${index}`}
                  className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-danger"
                >
                  Строка {issue.row} / {issue.field}: {issue.message}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardTitle title="История запусков" subtitle="Все выполненные и активные задачи обработки." />
        {!runs.length ? (
          <EmptyState
            title="Запусков пока нет"
            description="Запустите сбор по площадкам или ручной импорт."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-textMuted">
                  <th className="px-2 py-3">Run ID</th>
                  <th className="px-2 py-3">Источник</th>
                  <th className="px-2 py-3">Статус</th>
                  <th className="px-2 py-3">Этап</th>
                  <th className="px-2 py-3">Готовность</th>
                  <th className="px-2 py-3">Собрано</th>
                  <th className="px-2 py-3">Обработано</th>
                  <th className="px-2 py-3">Старт</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="cursor-pointer border-b border-border/60 hover:bg-panelMuted"
                    onClick={() => setActiveRunId(run.id)}
                  >
                    <td className="px-2 py-3">{run.id}</td>
                    <td className="px-2 py-3">{presentRunSource(run)}</td>
                    <td className="px-2 py-3">
                      <Badge
                        variant={
                          run.status === "completed"
                            ? "success"
                            : run.status === "failed"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {translateRunStatus(run.status)}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">{translateRunStage(run.stage)}</td>
                    <td className="px-2 py-3">{run.progressPct ?? 0}%</td>
                    <td className="px-2 py-3">{run.fetchedReviews ?? "-"}</td>
                    <td className="px-2 py-3">{run.totalReviewsProcessed}</td>
                    <td className="px-2 py-3">{formatDate(run.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function translateRunStatus(status: AnalysisRun["status"]): string {
  if (status === "completed") {
    return "Завершено";
  }
  if (status === "failed") {
    return "Ошибка";
  }
  if (status === "running") {
    return "В работе";
  }
  return "Ожидание";
}

function translateRunStage(stage?: string): string {
  if (!stage) {
    return "-";
  }
  const map: Record<string, string> = {
    fetching_reviews: "Сбор отзывов",
    normalizing_reviews: "Нормализация",
    deduping_reviews: "Дедупликация",
    analyzing_reviews: "Анализ",
    aggregating_insights: "Агрегация",
    completed: "Готово",
    failed: "Ошибка"
  };
  return map[stage] || stage;
}
