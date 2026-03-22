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
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/states";

interface HotelListResponse {
  items: Hotel[];
}

export function RecommendationsPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [payload, setPayload] = useState<RecommendationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stalePayload = payload && selectedHotelId && payload.hotel.id !== selectedHotelId;

  useEffect(() => {
    const loadHotels = async () => {
      try {
        const response = await fetchJson<HotelListResponse>("/api/hotels");
        setHotels(response.items);
        setSelectedHotelId((prev) =>
          response.items.some((hotel) => hotel.id === prev) ? prev : ""
        );
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки отелей.");
        setLoading(false);
      }
    };
    void loadHotels();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      setPayload(null);
      setLoading(false);
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
        setError(err instanceof Error ? err.message : "Ошибка загрузки рекомендаций.");
      } finally {
        setLoading(false);
      }
    };

    void loadRecommendations();
  }, [selectedHotelId]);

  if ((loading && !payload) || stalePayload) {
    return <LoadingState label="Формирую рекомендации..." />;
  }

  if (error && !payload) {
    return <ErrorState title="Ошибка рекомендаций" description={error} />;
  }

  if (!payload) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Рекомендации"
          subtitle="Приоритизированные действия с прозрачным бизнес-обоснованием."
          rightSlot={
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
          }
        />
        <EmptyState
          title="Выберите отель для рекомендаций"
          description="После выбора объекта система покажет приоритизированные действия по маркетингу, сервису и репутации."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Рекомендации"
        subtitle="Приоритизированные действия с прозрачным бизнес-обоснованием."
        rightSlot={
          <Select value={selectedHotelId} onChange={(event) => setSelectedHotelId(event.target.value)}>
            <option value="">Выберите отель</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </Select>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {payload.recommendations.length ? (
          payload.recommendations.map((recommendation) => (
            <Card key={recommendation.id}>
              <CardTitle title={recommendation.title} subtitle={recommendation.description} />
              <div className="flex flex-wrap gap-2">
                <Badge variant="info">{translateCategory(recommendation.category)}</Badge>
                <Badge variant={priorityVariant(recommendation.priority)}>
                  {translatePriority(recommendation.priority)}
                </Badge>
                <Badge variant="default">Эффект {recommendation.impactScore.toFixed(1)}</Badge>
                <Badge variant="default">Трудоемкость {recommendation.effortScore.toFixed(1)}</Badge>
              </div>
              <p className="mt-3 text-sm text-textMuted">{recommendation.rationale}</p>
              <p className="mt-3 text-xs text-textMuted">
                Сегменты:{" "}
                {recommendation.relatedSegments.map((segment) => SEGMENT_LABELS[segment]).join(", ") || "-"}
              </p>
              <p className="mt-1 text-xs text-textMuted">
                Темы:{" "}
                {recommendation.relatedTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "-"}
              </p>
            </Card>
          ))
        ) : (
          <div className="xl:col-span-2">
            <EmptyState
              title="Рекомендации пока не сформированы"
              description="Добавьте новые отзывы или запустите переанализ, чтобы сформировать управленческие действия."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function translateCategory(category: string): string {
  const map: Record<string, string> = {
    marketing: "Маркетинг",
    operations: "Операции",
    reputation: "Репутация",
    strategy: "Стратегия"
  };
  return map[category] || category;
}

function translatePriority(priority: string): string {
  const map: Record<string, string> = {
    high: "Высокий",
    medium: "Средний",
    low: "Низкий"
  };
  return map[priority] || priority;
}
