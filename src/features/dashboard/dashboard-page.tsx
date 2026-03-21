"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnalysisRun,
  DashboardPayload,
  Hotel,
  HotelSearchResult,
  SentimentLabel
} from "@/entities/types";
import { APP_NAME, UI_TEXT } from "@/shared/config/constants";
import { SENTIMENT_LABELS, SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";
import { formatDate, formatPercent, formatRating } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { riskVariant, sentimentVariant } from "@/shared/lib/presentation";
import { AnalysisProgress } from "@/shared/ui/analysis-progress";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { KpiCard } from "@/shared/ui/kpi-card";
import { PageHeader } from "@/shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/states";
import { SegmentDistributionChart } from "@/widgets/charts/segment-distribution-chart";
import { TopicDriverChart } from "@/widgets/charts/topic-driver-chart";

interface HotelListResponse {
  items: Hotel[];
}

interface SearchHotelsResponse {
  items: HotelSearchResult[];
}

interface CreateHotelResponse {
  item: Hotel;
}

interface RealtimeSyncResponse {
  result: {
    targetsStarted: number;
    runs: AnalysisRun[];
    warnings: string[];
  };
}

export function DashboardPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HotelSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadHotels = async () => {
      try {
        const response = await fetchJson<HotelListResponse>("/api/hotels");
        setHotels(response.items);
        if (response.items.length > 0) {
          setSelectedHotelId((prev) => prev || response.items[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить список отелей.");
      }
    };
    void loadHotels();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      setLoading(false);
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
        setError(err instanceof Error ? err.message : "Не удалось загрузить сводку по отелю.");
      } finally {
        setLoading(false);
      }
    };
    void loadDashboard();
  }, [selectedHotelId, reloadKey]);

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === selectedHotelId),
    [hotels, selectedHotelId]
  );

  const onSearchHotels = async () => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchError("Введите минимум 2 символа.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSyncMessage(null);
    try {
      const response = await fetchJson<SearchHotelsResponse>(
        `/api/hotels/search?q=${encodeURIComponent(query)}&limit=8`
      );
      setSearchResults(response.items);
      if (!response.items.length) {
        setSearchError(
          "По этому запросу отели не найдены. Попробуйте добавить город, например: «Hilton Казань»."
        );
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Поиск временно недоступен."
      );
    } finally {
      setSearching(false);
    }
  };

  const onCreateHotelFromSearch = async (candidate: HotelSearchResult) => {
    setSyncBusy(true);
    setSearchError(null);
    setSyncMessage(null);
    try {
      const response = await fetchJson<CreateHotelResponse>("/api/hotels", {
        method: "POST",
        body: JSON.stringify({
          name: candidate.name,
          city: candidate.city,
          country: candidate.country || "Россия",
          address: candidate.address,
          coordinates: candidate.coordinates,
          externalId: candidate.externalId,
          category: "4*",
          brand: "Независимый отель",
          description:
            "Профиль отеля создан через поиск. Аналитика формируется после загрузки отзывов."
        })
      });

      setHotels((prev) => {
        const map = new Map(prev.map((hotel) => [hotel.id, hotel]));
        map.set(response.item.id, response.item);
        return [...map.values()];
      });
      setSelectedHotelId(response.item.id);
      setSyncMessage(`Профиль отеля добавлен: ${response.item.name}.`);
      setSearchResults([]);
      setSearchQuery(`${response.item.name}, ${response.item.city}`);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Не удалось добавить профиль отеля."
      );
    } finally {
      setSyncBusy(false);
    }
  };

  const onRunRealtimeSync = async () => {
    if (!selectedHotelId) {
      return;
    }
    setSyncBusy(true);
    setSyncMessage(null);
    setSearchError(null);
    try {
      const response = await fetchJson<RealtimeSyncResponse>("/api/sync/realtime-hotel", {
        method: "POST",
        body: JSON.stringify({ hotelId: selectedHotelId })
      });
      const warningText = response.result.warnings.length
        ? ` Предупреждения: ${response.result.warnings.join(" | ")}`
        : "";
      setSyncMessage(
        `Запущен сбор по источникам: ${response.result.targetsStarted}.${warningText}`
      );
      setReloadKey((prev) => prev + 1);
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : "Не удалось запустить сбор отзывов по площадкам."
      );
    } finally {
      setSyncBusy(false);
    }
  };

  if (loading && !dashboard && selectedHotelId) {
    return (
      <div className="space-y-4">
        <LoadingState label="Загружаю сводную управленческую аналитику..." />
      </div>
    );
  }

  if (!selectedHotelId && !loading) {
    return (
      <div className="space-y-6">
        <SearchHero
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSearchHotels={onSearchHotels}
          searching={searching}
          searchResults={searchResults}
          onCreateHotelFromSearch={onCreateHotelFromSearch}
          searchError={searchError}
          busy={syncBusy}
        />
        <EmptyState
          title="Добавьте первый отель"
          description="Найдите отель через поиск выше, создайте профиль и запустите сбор отзывов."
        />
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <ErrorState
        title="Ошибка загрузки сводки"
        description={error || "Проверьте API и повторите попытку."}
      />
    );
  }

  if (!dashboard || !selectedHotel) {
    return (
      <ErrorState
        title="Данные по отелю недоступны"
        description="Выберите отель или добавьте его через поиск."
      />
    );
  }

  const { hotel, aggregate, executiveSummary, latestRun } = dashboard;

  return (
    <div className="space-y-6">
      <SearchHero
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchHotels={onSearchHotels}
        searching={searching}
        searchResults={searchResults}
        onCreateHotelFromSearch={onCreateHotelFromSearch}
        searchError={searchError}
        busy={syncBusy}
      />

      <PageHeader
        title={APP_NAME}
        badge="Управленческая панель"
        subtitle={`${hotel.name}. ${UI_TEXT.productTagline}`}
        rightSlot={
          <>
            <select
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              value={selectedHotelId}
              onChange={(event) => setSelectedHotelId(event.target.value)}
            >
              {hotels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={() => {
                setReloadKey((prev) => prev + 1);
              }}
            >
              Обновить сводку
            </Button>
            <Button
              onClick={onRunRealtimeSync}
              disabled={syncBusy}
              className="animate-fadePulse"
            >
              Собрать отзывы по площадкам
            </Button>
          </>
        }
      />

      {syncMessage ? <Badge variant="success">{syncMessage}</Badge> : null}

      <AnalysisProgress run={latestRun} />

      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div>
            <CardTitle
              title="Сводный вывод для руководителя"
              subtitle="Ключевые факторы качества сервиса и репутации объекта."
            />
            <p className="text-sm text-text">{executiveSummary.keyInsight}</p>
            <p className="mt-2 text-sm text-danger">Основной риск: {executiveSummary.keyRisk}</p>
            <p className="mt-2 text-sm text-success">
              Главная возможность: {executiveSummary.keyOpportunity}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="info">Статус анализа: {latestRun ? latestRun.status : "нет"}</Badge>
            <Badge variant="default">Обновлено: {formatDate(aggregate.updatedAt)}</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Средняя оценка"
          value={formatRating(executiveSummary.averageRating)}
          hint="Средний рейтинг по всем отзывам"
        />
        <KpiCard
          label="Всего отзывов"
          value={String(executiveSummary.totalReviews)}
          hint="Объем анализируемой выборки"
        />
        <KpiCard
          label="Итоговая тональность"
          value={SENTIMENT_LABELS[executiveSummary.overallSentimentLabel]}
          hint="Интегральный индекс эмоции"
        />
        <KpiCard
          label="Доминирующий сегмент"
          value={SEGMENT_LABELS[executiveSummary.dominantSegment]}
          hint="Ключевая аудитория объекта"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle
            title="Структура аудитории"
            subtitle="Распределение сегментов по вероятностной модели."
          />
          <SegmentDistributionChart data={aggregate.segmentDistribution} />
          <p className="mt-2 text-xs text-textMuted">
            Сегментация вероятностная и не предназначена для персонального профилирования.
          </p>
        </Card>
        <Card>
          <CardTitle
            title="Репутационные риски по темам"
            subtitle="Темы, которые чаще всего формируют негатив и просадку рейтинга."
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
                  <Badge variant={riskVariant(topic.riskLevel)}>{topic.riskLevel.toUpperCase()}</Badge>
                </div>
              ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle
            title="Позитивные драйверы"
            subtitle="Что поддерживает лояльность гостей и рейтинг объекта."
          />
          <TopicDriverChart data={aggregate.positiveDrivers} tone="positive" />
        </Card>
        <Card>
          <CardTitle
            title="Негативные драйверы"
            subtitle="Что чаще всего приводит к жалобам и снижению оценок."
          />
          <TopicDriverChart data={aggregate.negativeDrivers} tone="negative" />
        </Card>
      </div>

      <Card>
        <CardTitle
          title="Покрытие источников и свежесть данных"
          subtitle="Объем отзывов и динамика по каждой подключенной площадке."
        />
        <p className="mb-3 text-sm text-textMuted">{dashboard.dataHealth.reviewCoverageSummary}</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.sourceCoverage.length ? (
            dashboard.sourceCoverage.map((item) => (
              <div
                key={item.source}
                className="rounded-lg border border-border bg-panelMuted px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <Badge variant={sentimentVariant(scoreToLabel(item.averageSentiment))}>
                    {SENTIMENT_LABELS[scoreToLabel(item.averageSentiment)]}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-textMuted">
                  Отзывов: {item.reviews} ({formatPercent(item.share)})
                </p>
                <p className="mt-1 text-xs text-textMuted">
                  Средняя оценка: {formatRating(item.averageRating)}
                </p>
                <p className="mt-1 text-xs text-textMuted">
                  Обновление: {item.lastReviewDate ? formatDate(item.lastReviewDate) : "нет даты"}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-textMuted">
              Источники пока не подключены. Запустите сбор отзывов по площадкам.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle
          title="Инсайты по сегментам"
          subtitle="Что ценит каждый сегмент, где жалобы и как это влияет на бизнес."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          {aggregate.segmentInsights.slice(0, 6).map((item) => (
            <div key={item.segment} className="rounded-lg border border-border bg-panelMuted p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{item.label}</h4>
                <Badge variant={sentimentVariant(scoreToLabel(item.averageSentiment))}>
                  тональность {item.averageSentiment.toFixed(2)}
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
            title="Разбор отдельных отзывов"
            subtitle="Текст -> классификация -> объяснение -> управленческий сигнал."
          />
          <div className="space-y-3">
            {dashboard.sampleExplainedReviews.map(({ review, analysis }) => (
              <article key={review.id} className="rounded-lg border border-border bg-panelMuted p-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={sentimentVariant(analysis.sentimentLabel)}>
                    {SENTIMENT_LABELS[analysis.sentimentLabel]}
                  </Badge>
                  <Badge variant="info">{SEGMENT_LABELS[analysis.primarySegment]}</Badge>
                  <Badge variant="default">
                    Уверенность {(analysis.confidence * 100).toFixed(1)}%
                  </Badge>
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
            title="Рекомендации к действию"
            subtitle="Приоритетные шаги по маркетингу, операционке и репутации."
          />
          <div className="space-y-3">
            {dashboard.recommendationsPreview.map((recommendation) => (
              <div
                key={recommendation.id}
                className="rounded-lg border border-border bg-panelMuted p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{translateCategory(recommendation.category)}</Badge>
                  <Badge variant={recommendation.priority === "high" ? "danger" : "warning"}>
                    {translatePriority(recommendation.priority)}
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
          title="Операционные приоритеты"
          subtitle="Задачи, которые стоит поставить на контроль менеджменту объекта."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-panelMuted p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-textMuted">Риски</p>
            <ul className="mt-2 space-y-2 text-sm">
              {aggregate.keyRisks.length ? (
                aggregate.keyRisks.map((risk) => <li key={risk}>• {risk}</li>)
              ) : (
                <li>• Критичные риски не выявлены.</li>
              )}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-panelMuted p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-textMuted">
              Возможности роста
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {aggregate.growthOpportunities.length ? (
                aggregate.growthOpportunities.map((item) => <li key={item}>• {item}</li>)
              ) : (
                <li>• Выраженные возможности роста не выявлены на текущей выборке.</li>
              )}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SearchHero(props: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearchHotels: () => Promise<void>;
  searching: boolean;
  searchResults: HotelSearchResult[];
  onCreateHotelFromSearch: (candidate: HotelSearchResult) => Promise<void>;
  searchError: string | null;
  busy: boolean;
}) {
  const {
    searchQuery,
    setSearchQuery,
    onSearchHotels,
    searching,
    searchResults,
    onCreateHotelFromSearch,
    searchError,
    busy
  } = props;

  return (
    <Card className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-[#f6fbff] via-white to-[#eaf6ff]">
      <div className="search-hero-orb pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-cyan-200/55 blur-2xl" />
      <div className="search-hero-orb pointer-events-none absolute -bottom-12 -right-10 h-48 w-48 rounded-full bg-blue-200/45 blur-2xl" />
      <CardTitle
        title="Найдите любой отель в России"
        subtitle="Введите название отеля и город. После добавления запустите сбор отзывов по площадкам."
      />
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <Input
          value={searchQuery}
          placeholder="Например: Marriott Ростов-на-Дону"
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void onSearchHotels();
            }
          }}
        />
        <Button
          onClick={() => {
            void onSearchHotels();
          }}
          disabled={searching}
          className={searching ? "animate-pulse" : ""}
        >
          {searching ? "Идет поиск..." : "Найти отель"}
        </Button>
      </div>

      {searchError ? <p className="mt-3 text-sm text-danger">{searchError}</p> : null}

      {searchResults.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {searchResults.map((item) => (
            <article
              key={item.externalId}
              className="search-result-card rounded-lg border border-border bg-white/85 p-3"
            >
              <p className="text-sm font-semibold">{item.name}</p>
              <p className="mt-1 text-xs text-textMuted">
                {item.city}, {item.country}
              </p>
              <p className="mt-1 text-xs text-textMuted">{item.address}</p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    void onCreateHotelFromSearch(item);
                  }}
                >
                  Добавить в аналитику
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function scoreToLabel(score: number): SentimentLabel {
  if (score > 0.2) {
    return "positive";
  }
  if (score < -0.2) {
    return "negative";
  }
  return "neutral";
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
    low: "Низкий",
    medium: "Средний",
    high: "Высокий"
  };
  return map[priority] || priority;
}
