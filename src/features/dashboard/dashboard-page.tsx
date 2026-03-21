"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardPayload, Hotel } from "@/entities/types";
import { APP_NAME, UI_TEXT } from "@/shared/config/constants";
import { SENTIMENT_LABELS, SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";
import { formatDate, formatPercent, formatRating } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { riskVariant, sentimentVariant } from "@/shared/lib/presentation";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardTitle } from "@/shared/ui/card";
import { KpiCard } from "@/shared/ui/kpi-card";
import { PageHeader } from "@/shared/ui/page-header";
import { ErrorState, LoadingState } from "@/shared/ui/states";
import { SegmentDistributionChart } from "@/widgets/charts/segment-distribution-chart";
import { TopicDriverChart } from "@/widgets/charts/topic-driver-chart";

interface HotelListResponse {
  items: Hotel[];
}

export function DashboardPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHotels = async () => {
      try {
        const response = await fetchJson<HotelListResponse>("/api/hotels");
        setHotels(response.items);
        if (response.items.length > 0) {
          setSelectedHotelId((prev) => prev || response.items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить отели");
      }
    };
    void loadHotels();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      return;
    }
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchJson<DashboardPayload>(
          `/api/hotels/${selectedHotelId}/dashboard`
        );
        setDashboard(payload);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Не удалось загрузить dashboard данные"
        );
      } finally {
        setLoading(false);
      }
    };
    void loadDashboard();
  }, [selectedHotelId, reloadKey]);

  const hotelSelect = useMemo(
    () => (
      <select
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
        value={selectedHotelId}
        onChange={(event) => setSelectedHotelId(event.target.value)}
      >
        {hotels.map((hotel) => (
          <option key={hotel.id} value={hotel.id}>
            {hotel.name}
          </option>
        ))}
      </select>
    ),
    [hotels, selectedHotelId]
  );

  if (loading && !dashboard) {
    return (
      <div className="space-y-4">
        <LoadingState label="Загружаю executive dashboard..." />
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <ErrorState
        title="Ошибка загрузки Dashboard"
        description={error || "Проверьте API и повторите попытку."}
      />
    );
  }

  if (!dashboard) {
    return (
      <ErrorState
        title="Нет данных для Dashboard"
        description="Отсутствует аналитика по выбранному отелю."
      />
    );
  }

  const { hotel, aggregate, executiveSummary, latestRun } = dashboard;

  return (
    <div className="space-y-6">
      <PageHeader
        title={APP_NAME}
        badge="Executive Dashboard"
        subtitle={`${hotel.name}. ${UI_TEXT.productTagline}`}
        rightSlot={
          <>
            {hotelSelect}
            <Button
              variant="secondary"
              onClick={() => {
                setReloadKey((prev) => prev + 1);
              }}
            >
              Пересчитать
            </Button>
          </>
        }
      />

      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div>
            <CardTitle
              title="Overview / Executive Summary"
              subtitle="Ключевые индикаторы для управленческого решения."
            />
            <p className="text-sm text-text">
              {executiveSummary.keyInsight}
            </p>
            <p className="mt-2 text-sm text-danger">Риск: {executiveSummary.keyRisk}</p>
            <p className="mt-2 text-sm text-success">
              Возможность: {executiveSummary.keyOpportunity}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="info">
              Анализ: {latestRun ? latestRun.status : "n/a"}
            </Badge>
            <Badge variant="default">Обновлено: {formatDate(aggregate.updatedAt)}</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Average Rating"
          value={formatRating(executiveSummary.averageRating)}
          hint="Средняя оценка по отзывам"
        />
        <KpiCard
          label="Total Reviews"
          value={String(executiveSummary.totalReviews)}
          hint="Объем базы отзывов"
        />
        <KpiCard
          label="Overall Sentiment"
          value={SENTIMENT_LABELS[executiveSummary.overallSentimentLabel]}
          hint="Интегральная тональность"
        />
        <KpiCard
          label="Dominant Segment"
          value={SEGMENT_LABELS[executiveSummary.dominantSegment]}
          hint="Основная аудитория объекта"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle
            title="Audience Structure"
            subtitle="Распределение сегментов с вероятностной логикой."
          />
          <SegmentDistributionChart data={aggregate.segmentDistribution} />
          <p className="mt-2 text-xs text-textMuted">
            Note: сегментация носит вероятностный характер и не претендует на точное персональное профилирование.
          </p>
        </Card>
        <Card>
          <CardTitle
            title="Reputation Risk"
            subtitle="Темы с наибольшей вероятностью влияния на просадку оценок."
          />
          <div className="space-y-2">
            {aggregate.topicDistribution
              .slice()
              .sort((a, b) => b.negativeMentions - a.negativeMentions)
              .slice(0, 8)
              .map((topic) => (
                <div
                  key={topic.topic}
                  className="flex items-center justify-between rounded-lg border border-border bg-panelMuted px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold">{topic.label}</p>
                    <p className="text-xs text-textMuted">
                      Негативных упоминаний: {topic.negativeMentions}
                    </p>
                  </div>
                  <Badge variant={riskVariant(topic.riskLevel)}>
                    {topic.riskLevel.toUpperCase()}
                  </Badge>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle
            title="Positive Drivers"
            subtitle="Темы, которые поддерживают лояльность и рейтинг."
          />
          <TopicDriverChart data={aggregate.positiveDrivers} tone="positive" />
        </Card>
        <Card>
          <CardTitle
            title="Negative Drivers"
            subtitle="Темы, которые чаще всего создают потери лояльности."
          />
          <TopicDriverChart data={aggregate.negativeDrivers} tone="negative" />
        </Card>
      </div>

      <Card>
        <CardTitle
          title="Segment Insights"
          subtitle="Что ценит каждый сегмент и где ключевые зоны улучшения."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {aggregate.segmentInsights.slice(0, 6).map((item) => (
            <div
              key={item.segment}
              className="rounded-lg border border-border bg-panelMuted p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{item.label}</h4>
                <Badge variant={sentimentVariant(labelByScore(item.averageSentiment))}>
                  sentiment {item.averageSentiment.toFixed(2)}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-textMuted">
                Доля: {formatPercent(item.share)} | Ценят:{" "}
                {item.valuedTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "-"}
              </p>
              <p className="mt-1 text-xs text-textMuted">
                Жалобы:{" "}
                {item.complaintTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "-"}
              </p>
              <p className="mt-2 text-sm">{item.businessMeaning}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle
            title="Explainable Review Cards"
            subtitle="Примеры: текст -> классификация -> бизнес-сигнал."
          />
          <div className="space-y-3">
            {dashboard.sampleExplainedReviews.map(({ review, analysis }) => (
              <article
                key={review.id}
                className="rounded-lg border border-border bg-panelMuted p-3"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge variant={sentimentVariant(analysis.sentimentLabel)}>
                    {SENTIMENT_LABELS[analysis.sentimentLabel]}
                  </Badge>
                  <Badge variant="info">{SEGMENT_LABELS[analysis.primarySegment]}</Badge>
                  <Badge variant="default">Confidence {(analysis.confidence * 100).toFixed(1)}%</Badge>
                </div>
                <p className="mt-2 text-sm">{review.text}</p>
                <p className="mt-2 text-xs text-textMuted">
                  Почему: {analysis.explanation[2]?.details}
                </p>
              </article>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle
            title="Recommendations Preview"
            subtitle="Top actionable шаги для marketing/operations/reputation."
          />
          <div className="space-y-3">
            {dashboard.recommendationsPreview.map((recommendation) => (
              <div
                key={recommendation.id}
                className="rounded-lg border border-border bg-panelMuted p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{recommendation.category}</Badge>
                  <Badge variant={recommendation.priority === "high" ? "danger" : "warning"}>
                    {recommendation.priority}
                  </Badge>
                </div>
                <h4 className="mt-2 text-sm font-semibold">{recommendation.title}</h4>
                <p className="mt-1 text-sm text-textMuted">{recommendation.rationale}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle
          title="Future Readiness / Integrations"
          subtitle="Состояние foundation для V1 и SaaS-эволюции."
        />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {[
            "CSV upload",
            "API ingestion",
            "multi-hotel mode",
            "benchmark mode",
            "scheduled analytics"
          ].map((item) => (
            <div
              key={item}
              className="rounded-lg border border-border bg-panelMuted px-3 py-2 text-sm"
            >
              {item}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function labelByScore(score: number): "positive" | "neutral" | "negative" {
  if (score > 0.2) {
    return "positive";
  }
  if (score < -0.2) {
    return "negative";
  }
  return "neutral";
}
