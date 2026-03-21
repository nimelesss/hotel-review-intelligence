"use client";

import { useEffect, useState } from "react";
import { Hotel, RecommendationPayload } from "@/entities/types";
import { SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";
import { fetchJson } from "@/shared/lib/http";
import { priorityVariant } from "@/shared/lib/presentation";
import { Badge } from "@/shared/ui/badge";
import { Card, CardTitle } from "@/shared/ui/card";
import { PageHeader } from "@/shared/ui/page-header";
import { Select } from "@/shared/ui/select";
import { ErrorState, LoadingState } from "@/shared/ui/states";

interface HotelListResponse {
  items: Hotel[];
}

export function RecommendationsPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [payload, setPayload] = useState<RecommendationPayload | null>(null);
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
    const loadRecommendations = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchJson<RecommendationPayload>(
          `/api/recommendations/${selectedHotelId}`
        );
        setPayload(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки рекомендаций");
      } finally {
        setLoading(false);
      }
    };
    void loadRecommendations();
  }, [selectedHotelId]);

  if (loading && !payload) {
    return <LoadingState label="Готовлю рекомендации..." />;
  }
  if (error && !payload) {
    return <ErrorState title="Ошибка Recommendations" description={error} />;
  }
  if (!payload) {
    return (
      <ErrorState
        title="Нет рекомендаций"
        description="Не удалось получить рекомендации для выбранного отеля."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recommendations"
        subtitle="Rule-based actionable рекомендации с приоритетом и бизнес-обоснованием."
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

      <div className="grid gap-4 xl:grid-cols-2">
        {payload.recommendations.map((recommendation) => (
          <Card key={recommendation.id}>
            <CardTitle
              title={recommendation.title}
              subtitle={recommendation.description}
            />
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">{recommendation.category}</Badge>
              <Badge variant={priorityVariant(recommendation.priority)}>
                {recommendation.priority}
              </Badge>
              <Badge variant="default">
                Impact {recommendation.impactScore.toFixed(1)}
              </Badge>
              <Badge variant="default">
                Effort {recommendation.effortScore.toFixed(1)}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-textMuted">{recommendation.rationale}</p>
            <p className="mt-3 text-xs text-textMuted">
              Сегменты:{" "}
              {recommendation.relatedSegments
                .map((segment) => SEGMENT_LABELS[segment])
                .join(", ") || "-"}
            </p>
            <p className="mt-1 text-xs text-textMuted">
              Темы:{" "}
              {recommendation.relatedTopics
                .map((topic) => TOPIC_LABELS[topic])
                .join(", ") || "-"}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
