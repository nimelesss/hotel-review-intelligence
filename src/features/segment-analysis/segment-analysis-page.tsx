"use client";

import { useEffect, useState } from "react";
import { Hotel, SegmentAnalyticsPayload } from "@/entities/types";
import { TOPIC_LABELS } from "@/shared/config/taxonomy";
import { formatPercent } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { sentimentVariant } from "@/shared/lib/presentation";
import { Badge } from "@/shared/ui/badge";
import { Card, CardTitle } from "@/shared/ui/card";
import { PageHeader } from "@/shared/ui/page-header";
import { Select } from "@/shared/ui/select";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { SegmentDistributionChart } from "@/widgets/charts/segment-distribution-chart";

interface HotelListResponse {
  items: Hotel[];
}

export function SegmentAnalysisPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [payload, setPayload] = useState<SegmentAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHotels = async () => {
      try {
        const response = await fetchJson<HotelListResponse>("/api/hotels");
        setHotels(response.items);
        if (response.items[0]) {
          setSelectedHotelId(response.items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки отелей");
      }
    };
    void loadHotels();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      return;
    }
    const loadPayload = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchJson<SegmentAnalyticsPayload>(
          `/api/segments/${selectedHotelId}`
        );
        setPayload(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сегментного анализа");
      } finally {
        setLoading(false);
      }
    };
    void loadPayload();
  }, [selectedHotelId]);

  if (loading && !payload) {
    return <LoadingState label="Готовлю сегментный анализ..." />;
  }
  if (error && !payload) {
    return <ErrorState title="Ошибка Segment Analysis" description={error} />;
  }
  if (!payload) {
    return (
      <ErrorState
        title="Нет сегментных данных"
        description="Невозможно построить сегментный анализ."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Segment Analysis"
        subtitle="Вероятностная сегментация и business meaning по каждому профилю гостей."
        rightSlot={
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
        }
      />

      <Card>
        <CardTitle
          title="Segment Distribution"
          subtitle="Доли сегментов и относительная уверенность классификации."
        />
        <SegmentDistributionChart data={payload.segmentDistribution} />
      </Card>

      <Card>
        <CardTitle
          title="Marker Method Notes"
          subtitle="Прозрачные правила сегментации для бизнес-интерпретации."
        />
        <ul className="space-y-2">
          {payload.markerNotes.map((note) => (
            <li key={note} className="rounded-lg border border-border bg-panelMuted p-3 text-sm">
              {note}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {payload.segmentInsights.map((segment) => (
          <Card key={segment.segment}>
            <CardTitle title={segment.label} subtitle={segment.businessMeaning} />
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">Доля: {formatPercent(segment.share)}</Badge>
              <Badge variant={sentimentVariant(scoreToLabel(segment.averageSentiment))}>
                Avg sentiment: {segment.averageSentiment.toFixed(2)}
              </Badge>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-textMuted">
              Что ценят
            </p>
            <p className="mt-1 text-sm">
              {segment.valuedTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "-"}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-textMuted">
              На что жалуются
            </p>
            <p className="mt-1 text-sm">
              {segment.complaintTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "-"}
            </p>
            <p className="mt-3 text-xs text-textMuted">{segment.confidenceNote}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function scoreToLabel(score: number): "positive" | "neutral" | "negative" {
  if (score > 0.2) {
    return "positive";
  }
  if (score < -0.2) {
    return "negative";
  }
  return "neutral";
}
