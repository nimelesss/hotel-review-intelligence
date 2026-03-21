"use client";

import { useEffect, useState } from "react";
import {
  AnalysisRun,
  AnalysisRunSourceType,
  Hotel,
  IngestionPreviewResult
} from "@/entities/types";
import { formatDate } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardTitle } from "@/shared/ui/card";
import { PageHeader } from "@/shared/ui/page-header";
import { Select } from "@/shared/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/states";
import { Textarea } from "@/shared/ui/textarea";

interface HotelListResponse {
  items: Hotel[];
}

interface RunsResponse {
  items: AnalysisRun[];
}

const SAMPLE_CSV = `source,sourceReviewId,reviewDate,rating,title,text,language,authorName,stayTypeRaw
booking.com,new-101,2026-03-10,8.6,Командировка,"Быстрый check-in, стабильный Wi-Fi, удобно для работы.",ru,Иван,Business
google,new-102,2026-03-12,6.4,,\"На парковке мало мест, вечером долго ждали на ресепшн.\",ru,Мария,Transit`;

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

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const hotelsResponse = await fetchJson<HotelListResponse>("/api/hotels");
        setHotels(hotelsResponse.items);
        if (hotelsResponse.items[0]) {
          setSelectedHotelId(hotelsResponse.items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
      } finally {
        setLoading(false);
      }
    };
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      return;
    }
    const loadRuns = async () => {
      const response = await fetchJson<RunsResponse>(
        `/api/analysis-runs?hotelId=${selectedHotelId}`
      );
      setRuns(response.items);
    };
    void loadRuns();
  }, [selectedHotelId]);

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
      setMessage("Preview успешно рассчитан.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка preview");
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
      setRuns((prev) => [response.run, ...prev]);
      setMessage(`Импорт выполнен. Обработано: ${response.run.totalReviewsProcessed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка импорта");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Подготавливаю модуль загрузки..." />;
  }

  if (error && !hotels.length) {
    return <ErrorState title="Ошибка Upload" description={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Upload / Analysis Run"
        subtitle="Загрузка CSV/JSON, предварительная валидация и запуск анализа."
      />

      <Card>
        <CardTitle
          title="Upload Configuration"
          subtitle="Минимально достаточный ingestion flow для production foundation."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select
            value={selectedHotelId}
            onChange={(event) => setSelectedHotelId(event.target.value)}
          >
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
            onChange={(event) =>
              setSourceType(event.target.value as AnalysisRunSourceType)
            }
          >
            <option value="csv">csv</option>
            <option value="json">json</option>
            <option value="mock_api">mock_api</option>
            <option value="seed">seed</option>
          </Select>
          <div className="flex gap-2">
            <Button onClick={onPreview} disabled={busy}>
              Preview
            </Button>
            <Button variant="secondary" onClick={onImport} disabled={busy}>
              Import + Analyze
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <Textarea
            rows={10}
            value={payloadText}
            onChange={(event) => setPayloadText(event.target.value)}
          />
          <p className="mt-2 text-xs text-textMuted">
            Для MVP используется текстовый input; в V1 подключается file upload и background processing.
          </p>
        </div>
      </Card>

      {message ? <Badge variant="success">{message}</Badge> : null}
      {error ? <ErrorState title="Операция завершилась с ошибкой" description={error} /> : null}

      {preview ? (
        <Card>
          <CardTitle title="Validation Preview" subtitle="Результат проверки и нормализации." />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Всего строк: {preview.totalRows}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Валидных: {preview.validRows}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Дублей: {preview.duplicates}
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
                  Row {issue.row} / {issue.field}: {issue.message}
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardTitle title="Analysis Runs" subtitle="История запусков анализа по отелю." />
        {!runs.length ? (
          <EmptyState
            title="Запусков пока нет"
            description="Сделайте импорт данных и запустите первый analysis run."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-textMuted">
                  <th className="px-2 py-3">Run ID</th>
                  <th className="px-2 py-3">Source</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Reviews</th>
                  <th className="px-2 py-3">Started</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/60">
                    <td className="px-2 py-3">{run.id}</td>
                    <td className="px-2 py-3">{run.sourceType}</td>
                    <td className="px-2 py-3">
                      <Badge variant={run.status === "completed" ? "success" : "warning"}>
                        {run.status}
                      </Badge>
                    </td>
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
