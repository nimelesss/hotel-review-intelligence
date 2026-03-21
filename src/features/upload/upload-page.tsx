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

const SAMPLE_CSV = `source,sourceReviewId,reviewDate,rating,title,text,language,authorName,stayTypeRaw
booking.com,new-101,2026-03-10,8.6,Business trip,"Quick check-in, stable Wi-Fi, good desk for work.",ru,Ivan,Business
google,new-102,2026-03-12,6.4,,\"Parking was overloaded and reception queue was slow.\",ru,Maria,Transit`;

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
    country: "Russia",
    brand: "",
    category: "4*",
    address: "",
    description: ""
  });

  const [platformProvider, setPlatformProvider] =
    useState<PlatformProvider>("google_places");
  const [platformQuery, setPlatformQuery] = useState("");
  const [platformLimit, setPlatformLimit] = useState("120");
  const [apifyDatasetUrl, setApifyDatasetUrl] = useState("");

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
    () => runs.find((run) => run.id === activeRunId) || runs.find((run) => run.status === "running") || null,
    [runs, activeRunId]
  );

  async function loadHotels() {
    try {
      const hotelsResponse = await fetchJson<HotelListResponse>("/api/hotels");
      setHotels(hotelsResponse.items);
      if (hotelsResponse.items[0]) {
        setSelectedHotelId((prev) => prev || hotelsResponse.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hotels.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns(hotelId: string) {
    try {
      const response = await fetchJson<RunsResponse>(
        `/api/analysis-runs?hotelId=${hotelId}`
      );
      setRuns(response.items);
      if (!activeRunId && response.items[0]) {
        setActiveRunId(response.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis runs.");
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
      setMessage(`Hotel profile created: ${response.item.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create hotel failed.");
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
      setMessage("Preview completed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
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
      setMessage(`Import done. Processed reviews: ${response.run.totalReviewsProcessed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
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
      const response = await fetchJson<{ run: AnalysisRun }>(
        "/api/analysis-runs/from-platform",
        {
          method: "POST",
          body: JSON.stringify({
            hotelId: selectedHotelId,
            provider: platformProvider,
            query: platformQuery,
            limit: Number(platformLimit || 120),
            language: "ru",
            apifyDatasetUrl:
              platformProvider === "apify_dataset" ? apifyDatasetUrl.trim() : undefined
          })
        }
      );
      setRuns((prev) => [response.run, ...prev.filter((item) => item.id !== response.run.id)]);
      setActiveRunId(response.run.id);
      setMessage("Platform ingestion started. Processing is running in background.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Platform ingestion start failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingState label="Preparing upload and ingestion module..." />;
  }

  if (error && !hotels.length) {
    return <ErrorState title="Upload module error" description={error} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Upload / Analysis Run"
        subtitle="Create any Russian hotel profile, ingest review data, and run analytics with live processing states."
        badge="Processing + Real Sources"
      />

      <Card className="anim-delay-1">
        <CardTitle
          title="1) Add New Hotel (Any Russian Hotel)"
          subtitle="Create a hotel profile before ingestion. This removes the limit of seed-only hotels."
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Input
            placeholder="Hotel name"
            value={newHotel.name}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <Input
            placeholder="City"
            value={newHotel.city}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, city: event.target.value }))
            }
          />
          <Input
            placeholder="Country"
            value={newHotel.country}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, country: event.target.value }))
            }
          />
          <Input
            placeholder="Brand (optional)"
            value={newHotel.brand}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, brand: event.target.value }))
            }
          />
          <Input
            placeholder="Category (4*, 5*)"
            value={newHotel.category}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, category: event.target.value }))
            }
          />
          <Input
            placeholder="Address (optional)"
            value={newHotel.address}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, address: event.target.value }))
            }
          />
          <Input
            className="md:col-span-2 xl:col-span-3"
            placeholder="Description (optional)"
            value={newHotel.description}
            onChange={(event) =>
              setNewHotel((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </div>
        <div className="mt-3">
          <Button onClick={onCreateHotel} disabled={busy || !newHotel.name || !newHotel.city}>
            Create Hotel Profile
          </Button>
        </div>
      </Card>

      <Card className="anim-delay-2">
        <CardTitle
          title="2) Platform Reviews Ingestion (Real Sources)"
          subtitle="Run real source collection and analytics pipeline with live progress."
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
            value={platformProvider}
            onChange={(event) =>
              setPlatformProvider(event.target.value as PlatformProvider)
            }
          >
            <option value="google_places">Google Places API</option>
            <option value="apify_dataset">Apify Dataset (bulk, multi-platform)</option>
          </Select>

          <Input
            placeholder="Search query (hotel + city)"
            value={platformQuery}
            onChange={(event) => setPlatformQuery(event.target.value)}
          />

          <Input
            placeholder="Max reviews"
            value={platformLimit}
            onChange={(event) => setPlatformLimit(event.target.value)}
          />

          {platformProvider === "apify_dataset" ? (
            <Input
              className="md:col-span-2 xl:col-span-4"
              placeholder="Apify dataset URL: https://api.apify.com/v2/datasets/<id>/items?token=..."
              value={apifyDatasetUrl}
              onChange={(event) => setApifyDatasetUrl(event.target.value)}
            />
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onPlatformAnalyze} disabled={busy || !selectedHotelId}>
            Fetch Platform Reviews + Analyze
          </Button>
          <Badge variant="info">Pipeline: fetch → normalize → dedupe → analyze</Badge>
        </div>
        <p className="mt-2 text-xs text-textMuted">
          Google Places requires server env key: GOOGLE_PLACES_API_KEY. For higher volume and multi-platform imports use Apify dataset URL.
        </p>
      </Card>

      <AnalysisProgress run={activeRun} className="anim-delay-3" />

      <Card>
        <CardTitle
          title="3) Manual Upload (CSV/JSON)"
          subtitle="Alternative ingestion path for exports from OTA/PMS/CRM."
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
        </div>
      </Card>

      {message ? <Badge variant="success">{message}</Badge> : null}
      {error ? <ErrorState title="Operation failed" description={error} /> : null}

      {preview ? (
        <Card>
          <CardTitle title="Validation Preview" subtitle="Review data quality before import." />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Rows: {preview.totalRows}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Valid: {preview.validRows}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Duplicates: {preview.duplicates}
            </div>
            <div className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              Issues: {preview.issues.length}
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
        <CardTitle title="Analysis Runs" subtitle="History and current status of all runs." />
        {!runs.length ? (
          <EmptyState
            title="No runs yet"
            description="Start a platform ingestion or manual import to create first run."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-textMuted">
                  <th className="px-2 py-3">Run ID</th>
                  <th className="px-2 py-3">Source</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3">Stage</th>
                  <th className="px-2 py-3">Progress</th>
                  <th className="px-2 py-3">Fetched</th>
                  <th className="px-2 py-3">Processed</th>
                  <th className="px-2 py-3">Started</th>
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
                    <td className="px-2 py-3">{run.provider || run.sourceType}</td>
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
                        {run.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-3">{run.stage || "-"}</td>
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
