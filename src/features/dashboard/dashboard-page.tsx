"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DashboardPayload,
  Hotel,
  HotelSearchResult,
  SentimentLabel
} from "@/entities/types";
import { APP_NAME, UI_TEXT } from "@/shared/config/constants";
import { SENTIMENT_LABELS, SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";
import { formatPercent, formatRating } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { riskVariant, sentimentVariant } from "@/shared/lib/presentation";
import { stripAccommodationWords } from "@/shared/lib/text";
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

const SEARCH_DEBOUNCE_MS = 360;

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
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchLockQuery, setSearchLockQuery] = useState<string | null>(null);

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pendingScrollToStats, setPendingScrollToStats] = useState(false);

  useEffect(() => {
    const loadHotels = async () => {
      try {
        const response = await fetchJson<HotelListResponse>("/api/hotels?limit=60");
        setHotels(response.items);
        setSelectedHotelId((prev) => {
          const prevExists = response.items.some((hotel) => hotel.id === prev);
          return prevExists ? prev : "";
        });
        if (!response.items.length) {
          setDashboard(null);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось загрузить список отелей.");
      }
    };

    void loadHotels();
  }, []);

  useEffect(() => {
    if (!selectedHotelId) {
      setDashboard(null);
      setError(null);
      setLoading(false);
      return;
    }

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchJson<DashboardPayload>(`/api/hotels/${selectedHotelId}/dashboard`);
        setDashboard(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Не удалось загрузить сводку по отелю.";
        const normalizedMessage = message.toLocaleLowerCase("ru-RU");
        if (normalizedMessage.includes("отель не найден") || normalizedMessage.includes("hotel not found")) {
          setSelectedHotelId("");
          setDashboard(null);
          setError(null);
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [selectedHotelId, reloadKey]);

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === selectedHotelId) || dashboard?.hotel || undefined,
    [dashboard?.hotel, hotels, selectedHotelId]
  );

  useEffect(() => {
    if (!dashboard?.hotel) {
      return;
    }

    setHotels((prev) => {
      if (prev.some((hotel) => hotel.id === dashboard.hotel.id)) {
        return prev;
      }

      return [dashboard.hotel, ...prev].slice(0, 60);
    });
  }, [dashboard?.hotel]);

  const onSearchInputChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchLockQuery && normalizeKey(value) !== normalizeKey(searchLockQuery)) {
        setSearchLockQuery(null);
      }
    },
    [searchLockQuery]
  );

  useEffect(() => {
    if (!dashboard?.latestRun || dashboard.latestRun.status !== "running") {
      return;
    }

    const timer = setTimeout(() => {
      setReloadKey((prev) => prev + 1);
    }, 2500);

    return () => clearTimeout(timer);
  }, [dashboard?.latestRun?.id, dashboard?.latestRun?.status, dashboard?.latestRun?.progressPct]);

  const searchHotelsByQuery = useCallback(async (queryInput: string, silent = false) => {
    const query = queryInput.trim();
    if (query.length < 2) {
      if (!silent) {
        setSearchError("Введите минимум 2 символа.");
      }
      setSearchResults([]);
      setShowSearchResults(false);
      return [] as HotelSearchResult[];
    }

    setSearching(true);
    if (!silent) {
      setSearchError(null);
      setSyncMessage(null);
    }

    try {
      const response = await fetchJson<SearchHotelsResponse>(`/api/hotels/search?q=${encodeURIComponent(query)}&limit=20`);
      setSearchResults(response.items);
      setShowSearchResults(true);

      if (!response.items.length && !silent) {
        setSearchError(
          "По этому запросу отели не найдены. Уточните объект и город, например: «Courtyard by Marriott Ростов-на-Дону»."
        );
      }
      return response.items;
    } catch (err) {
      if (!silent) {
        setSearchError(err instanceof Error ? err.message : "Поиск временно недоступен.");
      }
      return [] as HotelSearchResult[];
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      setSearchError(null);
      return;
    }
    if (searchLockQuery && normalizeKey(query) === normalizeKey(searchLockQuery)) {
      return;
    }
    setShowSearchResults(true);

    const timer = setTimeout(() => {
      void searchHotelsByQuery(query, true);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery, searchHotelsByQuery, searchLockQuery]);

  useEffect(() => {
    if (!pendingScrollToStats || !selectedHotelId || !dashboard) {
      return;
    }

    const timer = setTimeout(() => {
      const anchor = document.getElementById("dashboard-stats-anchor");
      anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScrollToStats(false);
    }, 140);

    return () => clearTimeout(timer);
  }, [pendingScrollToStats, selectedHotelId, dashboard]);

  const onSearchHotels = async () => {
    const items = await searchHotelsByQuery(searchQuery, false);
    const normalizedQuery = normalizeKey(searchQuery);
    const exactMatch = items.find((item) => {
      const name = normalizeKey(item.name);
      const nameCity = normalizeKey(`${item.name}, ${item.city}`);
      const nameCityCompact = normalizeKey(`${item.name} ${item.city}`);
      return name === normalizedQuery || nameCity === normalizedQuery || nameCityCompact === normalizedQuery;
    });

    if (exactMatch) {
      await onCreateHotelFromSearch(exactMatch);
      return;
    }

    if (selectedHotelId && selectedHotel) {
      const selectedName = normalizeKey(selectedHotel.name);
      const selectedNameCity = normalizeKey(`${selectedHotel.name}, ${selectedHotel.city}`);
      if (selectedName === normalizedQuery || selectedNameCity === normalizedQuery || normalizedQuery.includes(selectedName)) {
        setShowSearchResults(false);
        setSearchResults([]);
        setSearchLockQuery(searchQuery);
        setPendingScrollToStats(true);
      }
    }
  };

  const focusSearchHero = useCallback(() => {
    document.getElementById("hotel-search-hero")?.scrollIntoView({ behavior: "smooth", block: "start" });

    window.setTimeout(() => {
      const input = document.getElementById("hotel-search-input") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 180);
  }, []);

  const onCreateHotelFromSearch = async (candidate: HotelSearchResult) => {
    setSyncBusy(true);
    setSearchError(null);
    setSyncMessage(null);
    try {
      const existing = findBestExistingHotel(hotels, candidate);

      if (existing) {
        const nextQuery = `${existing.name}, ${existing.city}`;
        setSelectedHotelId(existing.id);
        setSyncMessage(`Открыт существующий профиль: ${existing.name}.`);
        setSearchResults([]);
        setShowSearchResults(false);
        setSearchLockQuery(nextQuery);
        setSearchQuery(nextQuery);
        setPendingScrollToStats(true);
        return;
      }

      if (candidate.externalId?.startsWith("hotel-")) {
        const repositoryHotelId = candidate.externalId;
        const nextQuery = `${candidate.name}, ${candidate.city}`;
        setSelectedHotelId(repositoryHotelId);
        setSyncMessage(`Открыт существующий профиль: ${candidate.name}.`);
        setSearchResults([]);
        setShowSearchResults(false);
        setSearchLockQuery(nextQuery);
        setSearchQuery(nextQuery);
        setPendingScrollToStats(true);
        return;
      }

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
          description: "Профиль отеля создан через поиск. Аналитика формируется после загрузки отзывов."
        })
      });

      setHotels((prev) => {
        const map = new Map(prev.map((hotel) => [hotel.id, hotel]));
        map.set(response.item.id, response.item);
        return [...map.values()];
      });
      const nextQuery = `${response.item.name}, ${response.item.city}`;
      setSelectedHotelId(response.item.id);
      setSyncMessage(`Профиль отеля добавлен: ${response.item.name}.`);
      setSearchResults([]);
      setShowSearchResults(false);
      setSearchLockQuery(nextQuery);
      setSearchQuery(nextQuery);
      setPendingScrollToStats(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Не удалось добавить профиль отеля.");
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
          setSearchQuery={onSearchInputChange}
          onSearchHotels={onSearchHotels}
          searching={searching}
          showSearchResults={showSearchResults}
          searchResults={searchResults}
          onCreateHotelFromSearch={onCreateHotelFromSearch}
          searchError={searchError}
          busy={syncBusy}
        />
        <EmptyState
          title="Начните с поиска нужного объекта"
          description="Найдите отель по названию и городу. После выбора система откроет управленческую сводку и позволит обновить аналитику по отзывам."
        />
      </div>
    );
  }

  if (error && !dashboard) {
    return <ErrorState title="Ошибка загрузки сводки" description={error || "Проверьте API и повторите попытку."} />;
  }

  if (!dashboard || !selectedHotel) {
    return <ErrorState title="Данные по отелю недоступны" description="Выберите отель или добавьте его через поиск." />;
  }

  const { hotel, aggregate, executiveSummary } = dashboard;
  const sampleReviews = dashboard.sampleExplainedReviews.slice(0, 3);
  const previewRecommendations = dashboard.recommendationsPreview.slice(0, 4);
  const topRisks = aggregate.topicDistribution
    .slice()
    .sort((a, b) => b.negativeMentions - a.negativeMentions)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <SearchHero
        searchQuery={searchQuery}
        setSearchQuery={onSearchInputChange}
        onSearchHotels={onSearchHotels}
        searching={searching}
        showSearchResults={showSearchResults}
        searchResults={searchResults}
        onCreateHotelFromSearch={onCreateHotelFromSearch}
        searchError={searchError}
        busy={syncBusy}
      />
      <div id="dashboard-stats-anchor" className="scroll-mt-6" />

      <PageHeader
        title={hotel.name}
        badge="Управленческая сводка"
        subtitle={`${hotel.city}, ${hotel.country}. ${UI_TEXT.productTagline}.`}
        rightSlot={
          <>
            <Button variant="secondary" onClick={focusSearchHero}>Сменить отель</Button>
          </>
        }
      />

      {syncMessage ? <Badge variant="success">{syncMessage}</Badge> : null}

      {aggregate.totalReviews > 0 ? (
        <Card className="xl:hidden">
          <CardTitle kicker="Структура аудитории" title="Структура аудитории" subtitle="Вероятностное распределение сегментов и их вклад в текущую картину спроса." />
          <SegmentDistributionChart data={aggregate.segmentDistribution} />
          <p className="mt-3 text-sm leading-6 text-textMuted">Сегментация носит вероятностный характер и используется как управленческая интерпретация отзывов, а не как персональный профиль гостя.</p>
        </Card>
      ) : null}

      {aggregate.totalReviews === 0 ? (
        <Card>
          <CardTitle
            kicker="Готовность данных"
            title="Отзывы для выбранного отеля пока не подключены"
            subtitle="Профиль найден, но в текущей выборке нет данных для управленческой аналитики."
          />
          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[1.2rem] border border-border bg-panelMuted p-4">
              <p className="text-sm leading-7 text-textMuted">
                Для этого объекта в текущем контуре еще не подключен корпус отзывов. Вы можете выбрать другой профиль в каталоге или вернуться к этому отелю позже, когда данные будут подготовлены.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="secondary" onClick={focusSearchHero} size="lg">Выбрать другой отель</Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
          <div>
            <CardTitle
              kicker="Сводный вывод"
              title="Сводный вывод для руководителя"
              subtitle="Ключевые сигналы по качеству сервиса, репутации и приоритетам управленческой команды."
            />
            <p className="max-w-3xl text-[15px] leading-8 text-text">{executiveSummary.keyInsight}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <HighlightPanel title="Главный риск" tone="danger">{executiveSummary.keyRisk}</HighlightPanel>
              <HighlightPanel title="Главная возможность" tone="success">{executiveSummary.keyOpportunity}</HighlightPanel>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <SnapshotTile label="Текущая выборка" value={`${aggregate.totalReviews} отзывов`} detail="Сводка строится по всем доступным отзывам выбранного объекта." />
            <SnapshotTile label="Тем в модели" value={String(aggregate.topicDistribution.length)} detail="Количество тематических направлений, по которым система формирует управленческие сигналы." />
            <SnapshotTile label="Действий в фокусе" value={String(previewRecommendations.length)} detail="Приоритетные рекомендации, которые стоит обсудить с командой управления." />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Средняя оценка" value={formatRating(executiveSummary.averageRating)} hint="Средний рейтинг по всем отзывам в текущей выборке." emphasis="accent" />
        <KpiCard label="Всего отзывов" value={String(executiveSummary.totalReviews)} hint="Объем данных, который используется в аналитической модели." />
        <KpiCard
          label="Итоговая тональность"
          value={SENTIMENT_LABELS[executiveSummary.overallSentimentLabel]}
          hint="Интегральный эмоциональный профиль текущей репутации."
          emphasis={executiveSummary.overallSentimentLabel === "negative" ? "danger" : executiveSummary.overallSentimentLabel === "positive" ? "success" : "neutral"}
        />
        <KpiCard label="Доминирующий сегмент" value={SEGMENT_LABELS[executiveSummary.dominantSegment]} hint="Сегмент, который чаще всего формирует текущий спрос и обратную связь." emphasis="accent" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="hidden xl:block">
          <CardTitle kicker="Структура аудитории" title="Структура аудитории" subtitle="Вероятностное распределение сегментов и их вклад в текущую картину спроса." />
          <SegmentDistributionChart data={aggregate.segmentDistribution} />
          <p className="mt-3 text-sm leading-6 text-textMuted">Сегментация носит вероятностный характер и используется как управленческая интерпретация отзывов, а не как персональный профиль гостя.</p>
        </Card>
        <Card>
          <CardTitle kicker="Карта рисков" title="Репутационные риски по темам" subtitle="Темы, которые чаще всего создают негатив, просадку оценки и требуют внимания операционной команды." />
          <div className="space-y-3">
            {topRisks.map((topic) => (
              <div key={topic.topic} className="rounded-[1.15rem] border border-border bg-panelMuted p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">{topic.label}</p>
                    <p className="mt-1 text-xs text-textMuted">Негативных упоминаний: {topic.negativeMentions}</p>
                  </div>
                  <Badge variant={riskVariant(topic.riskLevel)}>{topic.riskLevel}</Badge>
                </div>
                <div className="mt-3 h-2 rounded-full bg-panelStrong">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, topic.negativeMentions * 10)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle kicker="Позитивные драйверы" title="Позитивные драйверы" subtitle="Что поддерживает лояльность гостей и усиливает сильные стороны объекта." />
          <TopicDriverChart data={aggregate.positiveDrivers} tone="positive" />
        </Card>
        <Card>
          <CardTitle kicker="Негативные драйверы" title="Негативные драйверы" subtitle="Какие темы чаще всего вызывают жалобы и снижают воспринимаемое качество сервиса." />
          <TopicDriverChart data={aggregate.negativeDrivers} tone="negative" />
        </Card>
      </div>


      <Card>
        <CardTitle kicker="Сегменты" title="Инсайты по сегментам" subtitle="Что ценит каждый сегмент, где возникают жалобы и как это влияет на управленческие решения." />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {aggregate.segmentInsights.slice(0, 6).map((item) => (
            <div key={item.segment} className="rounded-[1.25rem] border border-border bg-panelMuted p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-text">{item.label}</h4>
                  <p className="mt-2 text-xs text-textMuted">Доля {formatPercent(item.share)}</p>
                </div>
                <Badge variant={sentimentVariant(scoreToLabel(item.averageSentiment))}>{item.averageSentiment.toFixed(2)}</Badge>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-textMuted">
                <p><span className="font-semibold text-text">Ценят:</span> {item.valuedTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "—"}</p>
                <p><span className="font-semibold text-text">Жалуются:</span> {item.complaintTopics.map((topic) => TOPIC_LABELS[topic]).join(", ") || "—"}</p>
              </div>
              <p className="mt-4 text-sm leading-7 text-text">{item.businessMeaning}</p>
              <p className="mt-4 text-xs leading-6 text-textSoft">{item.confidenceNote}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle kicker="Объяснимость" title="Разбор отдельных отзывов" subtitle="Как конкретный текст превращается в тему, сегмент и управленческий сигнал." />
          <div className="space-y-3">
            {sampleReviews.map(({ review, analysis }) => (
              <article key={review.id} className="rounded-[1.2rem] border border-border bg-panelMuted p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={sentimentVariant(analysis.sentimentLabel)}>{SENTIMENT_LABELS[analysis.sentimentLabel]}</Badge>
                  <Badge variant="info">{SEGMENT_LABELS[analysis.primarySegment]}</Badge>
                  <Badge variant="default">Уверенность {(analysis.confidence * 100).toFixed(1)}%</Badge>
                </div>
                <p className="mt-4 text-sm leading-7 text-text">{review.text}</p>
                <p className="mt-3 text-xs leading-6 text-textMuted">Почему система так решила: {analysis.explanation[2]?.details || analysis.explanation[0]?.details || "обнаружены тематические и тональные маркеры в тексте отзыва."}</p>
              </article>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle kicker="Рекомендации" title="Рекомендации к действию" subtitle="Приоритетные шаги по маркетингу, операционке и репутации на основе текущего корпуса отзывов." />
          <div className="space-y-3">
            {previewRecommendations.map((recommendation) => (
              <div key={recommendation.id} className="rounded-[1.2rem] border border-border bg-panelMuted p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{translateCategory(recommendation.category)}</Badge>
                  <Badge variant={recommendation.priority === "high" ? "danger" : recommendation.priority === "medium" ? "warning" : "default"}>{translatePriority(recommendation.priority)}</Badge>
                </div>
                <h4 className="mt-4 text-base font-semibold text-text">{recommendation.title}</h4>
                <p className="mt-2 text-sm leading-7 text-textMuted">{recommendation.rationale}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle kicker="Приоритеты управления" title="Операционные приоритеты" subtitle="Задачи, которые стоит поставить на контроль команде управления объектом уже сейчас." />
        <div className="grid gap-4 md:grid-cols-2">
          <PriorityList title="Риски" items={aggregate.keyRisks} emptyLabel="Критичные риски не выявлены." tone="danger" />
          <PriorityList title="Возможности роста" items={aggregate.growthOpportunities} emptyLabel="Выраженные возможности роста не выявлены на текущей выборке." tone="success" />
        </div>
      </Card>

      {dashboard.cityBenchmark && (
        <CityBenchmarkCard benchmark={dashboard.cityBenchmark} hotelName={stripAccommodationWords(hotel.name) || hotel.name} />
      )}
    </div>
  );
}

function CityBenchmarkCard(props: {
  benchmark: NonNullable<DashboardPayload["cityBenchmark"]>;
  hotelName: string;
}) {
  const { benchmark, hotelName } = props;
  const pctColor =
    benchmark.ratingPercentile >= 75
      ? "text-emerald-600 dark:text-emerald-400"
      : benchmark.ratingPercentile >= 50
      ? "text-sky-600 dark:text-sky-400"
      : benchmark.ratingPercentile >= 25
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

  return (
    <Card>
      <CardTitle
        kicker="Конкурентный анализ"
        title={`Позиция в ${benchmark.city}`}
        subtitle={benchmark.summary}
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-[1.15rem] border border-border bg-panelMuted/75 p-4 text-center shadow-insetSoft">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-textMuted">Перцентиль</p>
          <p className={`text-3xl font-bold ${pctColor}`}>{benchmark.ratingPercentile}%</p>
          <p className="mt-1 text-xs text-textSoft">топ-{100 - benchmark.ratingPercentile}%</p>
        </div>
        <div className="rounded-[1.15rem] border border-border bg-panelMuted/75 p-4 text-center shadow-insetSoft">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-textMuted">Место в городе</p>
          <p className="text-3xl font-bold text-text">{benchmark.ratingRank}<span className="text-base font-medium text-textSoft">/{benchmark.hotelCount}</span></p>
        </div>
        <div className="rounded-[1.15rem] border border-border bg-panelMuted/75 p-4 text-center shadow-insetSoft">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-textMuted">Ваш рейтинг</p>
          <p className="text-3xl font-bold text-text">{formatRating(benchmark.hotelRating)}</p>
          <p className="mt-1 text-xs text-textSoft">среднее по городу: {formatRating(benchmark.avgRating)}</p>
        </div>
        <div className="rounded-[1.15rem] border border-border bg-panelMuted/75 p-4 text-center shadow-insetSoft">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-textMuted">Отелей в городе</p>
          <p className="text-3xl font-bold text-text">{benchmark.hotelCount}</p>
          <p className="mt-1 text-xs text-textSoft">{benchmark.totalReviews} отзывов</p>
        </div>
      </div>

      {benchmark.topCompetitors.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">Ближайшие конкуренты</p>
          <div className="space-y-2">
            {benchmark.topCompetitors.map((comp, i) => {
              const isAbove = comp.rating > benchmark.hotelRating;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-[1rem] border border-border bg-panelMuted/65 px-3 py-2 text-sm shadow-insetSoft"
                >
                  <span className="mr-3 truncate text-text">{comp.name}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-textSoft">{comp.reviewCount} отз.</span>
                    <Badge variant={isAbove ? "danger" : "success"}>
                      {formatRating(comp.rating)}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {benchmark.categoryBreakdown.length > 0 && (
        <div className="mt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-textMuted">Распределение по рейтингу</p>
          <div className="flex gap-2">
            {benchmark.categoryBreakdown.map((cat) => {
              const pct = benchmark.hotelCount > 0 ? Math.round((cat.count / benchmark.hotelCount) * 100) : 0;
              return (
                <div key={cat.label} className="flex-1 rounded-[1rem] border border-border bg-panelMuted/65 p-2 text-center shadow-insetSoft">
                  <p className="text-xs text-textMuted">{cat.label}</p>
                  <p className="text-lg font-semibold text-text">{cat.count}</p>
                  <p className="text-[10px] text-textSoft">{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function SearchHero(props: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  onSearchHotels: () => Promise<void>;
  searching: boolean;
  showSearchResults: boolean;
  searchResults: HotelSearchResult[];
  onCreateHotelFromSearch: (candidate: HotelSearchResult) => Promise<void>;
  searchError: string | null;
  busy: boolean;
}) {
  const { searchQuery, setSearchQuery, onSearchHotels, searching, showSearchResults, searchResults, onCreateHotelFromSearch, searchError, busy } = props;

  return (
    <div id="hotel-search-hero">
      <Card className="search-hero-card relative overflow-hidden px-0 py-0 shadow-panel">
        <div className="search-hero-orb pointer-events-none absolute -left-12 top-3 h-44 w-44 rounded-full bg-cyan-200/45 blur-3xl" />
        <div className="search-hero-orb pointer-events-none absolute -right-12 bottom-4 h-56 w-56 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="relative px-5 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
            <Badge variant="info">{APP_NAME}</Badge>
            <h2 className="mt-5 max-w-xl text-3xl font-semibold leading-[1.05] text-text sm:text-[2.6rem]">Сотни отзывов — одна сводка.</h2>
            <p className="mt-3 text-base text-textMuted">Найдите отель и получите готовую аналитику по сегментам, темам и рискам.</p>
            <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input id="hotel-search-input" value={searchQuery} className="min-h-14 bg-panelSolid text-base" placeholder="Например: Courtyard by Marriott Ростов-на-Дону" onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void onSearchHotels(); } }} />
              <Button onClick={() => { void onSearchHotels(); }} disabled={searching} size="lg" className={searching ? "animate-pulse" : ""}>{searching ? "Ищем отели..." : "Найти отель"}</Button>
            </div>
            {searchError ? <p className="mt-3 text-sm leading-6 text-danger">{searchError}</p> : null}
          </div>
          <div className="hidden border-l border-border xl:block">
            <div className="grid h-full gap-3 p-6">
              <HeroInsightCard kicker="01 / Поиск" title="Найдите нужный объект" description="Система подсказывает только релевантные отели и не перегружает экран десятками лишних сущностей." />
              <HeroInsightCard kicker="02 / Интерпретация" title="Сразу к управленческой картине" description="После выбора отеля вы видите не витрину, а операционные сигналы, риски, сегменты и рекомендации." />
              <HeroInsightCard kicker="03 / Действие" title="Решения, а не просто графики" description="Интерфейс строится вокруг действий: усилить сильные стороны, исправить слабые темы, удержать сегменты." />
            </div>
          </div>
        </div>
        {showSearchResults && searchResults.length > 0 ? (
          <div className="border-t border-border px-5 py-5 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-textMuted">Подходящие объекты</p>
                <p className="mt-1 text-sm text-textMuted">Выберите подходящий объект, чтобы открыть или создать профиль в аналитике.</p>
              </div>
              <Badge variant="default">{searchResults.length} найдено</Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {searchResults.map((item) => (
                <article key={item.externalId} className="search-result-card rounded-[1.35rem] border border-border bg-panelSolid p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-text">{item.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-textMuted">{item.city}, {item.country}</p>
                    </div>
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-accent shadow-glow" />
                  </div>
                  <p className="mt-4 min-h-[3.25rem] text-sm leading-6 text-textMuted">{item.address}</p>
                  <div className="mt-4">
                    <Button variant="secondary" disabled={busy} onClick={() => { void onCreateHotelFromSearch(item); }}>Открыть в аналитике</Button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function HeroInsightCard({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-panelSolid p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-textMuted">{kicker}</p>
      <h3 className="mt-3 text-lg font-semibold text-text">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-textMuted">{description}</p>
    </div>
  );
}

function HighlightPanel({ title, tone, children }: { title: string; tone: "success" | "danger"; children: React.ReactNode }) {
  return (
    <div className={`rounded-[1.3rem] border p-4 ${tone === "success" ? "border-emerald-500/18 bg-emerald-500/8" : "border-rose-500/18 bg-rose-500/8"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${tone === "success" ? "text-success" : "text-danger"}`}>{title}</p>
      <p className="mt-3 text-sm leading-7 text-text">{children}</p>
    </div>
  );
}

function SnapshotTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.2rem] border border-border bg-panelMuted p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-textMuted">{label}</p>
      <p className="mt-3 text-xl font-semibold text-text">{value}</p>
      <p className="mt-3 text-sm leading-6 text-textMuted">{detail}</p>
    </div>
  );
}

function PriorityList({ title, items, emptyLabel, tone }: { title: string; items: string[]; emptyLabel: string; tone: "success" | "danger" }) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-panelMuted p-4">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${tone === "success" ? "text-success" : "text-danger"}`}>{title}</p>
      <ul className="mt-4 space-y-3 text-sm leading-7 text-textMuted">{items.length ? items.map((item) => <li key={item}>• {item}</li>) : <li>• {emptyLabel}</li>}</ul>
    </div>
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

function normalizeKey(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function findBestExistingHotel(hotels: Hotel[], candidate: HotelSearchResult): Hotel | undefined {
  return hotels
    .map((hotel) => ({ hotel, score: scoreExistingHotel(hotel, candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hotel)[0];
}

function scoreExistingHotel(hotel: Hotel, candidate: HotelSearchResult): number {
  let score = 0;
  const candidateExternal = normalizeKey(candidate.externalId || "");
  const hotelExternal = normalizeKey(hotel.externalId || "");
  let hasAnchorMatch = false;

  if (candidateExternal) {
    if (normalizeKey(hotel.id) === candidateExternal) {
      score += 700;
      hasAnchorMatch = true;
    }
    if (hotelExternal && hotelExternal === candidateExternal) {
      score += 640;
      hasAnchorMatch = true;
    }
  }

  const hotelKeys = buildHotelMatchKeys(hotel.name, hotel.city);
  const candidateKeys = buildHotelMatchKeys(candidate.name, candidate.city);
  const sharedKeys = [...candidateKeys].filter((key) => hotelKeys.has(key));
  if (sharedKeys.length > 0) {
    hasAnchorMatch = true;
  }
  score += sharedKeys.length * 140;

  if (normalizeKey(hotel.address) === normalizeKey(candidate.address || "")) {
    score += 80;
    hasAnchorMatch = true;
  }

  if (!hasAnchorMatch) {
    return 0;
  }

  if (normalizeKey(hotel.city) === normalizeKey(candidate.city)) {
    score += 50;
  }

  if ((hotel.reviewCount ?? 0) > 0) {
    score += 20;
  }

  score += Math.min(hotel.reviewCount ?? 0, 300) * 0.05;
  return score;
}

function buildHotelMatchKeys(name: string, city: string): Set<string> {
  const baseName = normalizeKey(name);
  const baseFull = normalizeKey(`${name} ${city}`);
  const strippedName = normalizeKey(stripAccommodationWords(name));
  const strippedFull = normalizeKey(stripAccommodationWords(`${name} ${city}`));
  const aliasName = replaceBrandAliases(baseName);
  const aliasFull = replaceBrandAliases(baseFull);
  const aliasStrippedName = replaceBrandAliases(strippedName);
  const aliasStrippedFull = replaceBrandAliases(strippedFull);
  const translitName = transliterateCyrillicToLatin(aliasName);
  const translitFull = transliterateCyrillicToLatin(aliasFull);
  const translitStrippedName = transliterateCyrillicToLatin(aliasStrippedName);
  const translitStrippedFull = transliterateCyrillicToLatin(aliasStrippedFull);

  return new Set([baseName, baseFull, strippedName, strippedFull, aliasName, aliasFull, aliasStrippedName, aliasStrippedFull, translitName, translitFull, translitStrippedName, translitStrippedFull].filter((value) => value.length >= 2));
}

function replaceBrandAliases(value: string): string {
  return value
    .replace(/\u043a\u043e\u0440\u0442[\u044a\u044c]?\u044f\u0440\u0434/giu, "courtyard")
    .replace(/\u043c\u0430\u0440\u0440\u0438?\u043e\u0442\u0442/giu, "marriott")
    .replace(/\u043c\u0430\u0440\u0438\u043d\u0441/giu, "marins")
    .replace(/\u0445\u0438\u043b\u0442\u043e\u043d/giu, "hilton")
    .replace(/\u0445\u0430\u044f\u0442\u0442/giu, "hyatt");
}

function transliterateCyrillicToLatin(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };

  return [...value].map((char) => map[char.toLocaleLowerCase("ru-RU")] ?? char).join("");
}





