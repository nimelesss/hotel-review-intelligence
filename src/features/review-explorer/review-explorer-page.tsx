"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Hotel,
  ReviewsQueryResult,
  SegmentId,
  SentimentLabel,
  TopicId
} from "@/entities/types";
import {
  SEGMENT_LABELS,
  SEGMENTS,
  SENTIMENT_LABELS,
  TOPIC_LABELS,
  TOPICS
} from "@/shared/config/taxonomy";
import { REVIEW_SOURCE_LABELS, REVIEW_SOURCE_PRIORITY } from "@/shared/config/sources";
import { formatDate } from "@/shared/lib/format";
import { fetchJson } from "@/shared/lib/http";
import { sentimentVariant } from "@/shared/lib/presentation";
import { Badge } from "@/shared/ui/badge";
import { Card, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/page-header";
import { Select } from "@/shared/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/shared/ui/states";

interface HotelListResponse {
  items: Hotel[];
}

interface FiltersState {
  sentiment: SentimentLabel | "";
  segment: SegmentId | "";
  topic: TopicId | "";
  source: string;
  ratingMin: string;
  ratingMax: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export function ReviewExplorerPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [filters, setFilters] = useState<FiltersState>({
    sentiment: "",
    segment: "",
    topic: "",
    source: "",
    ratingMin: "",
    ratingMax: "",
    dateFrom: "",
    dateTo: "",
    search: ""
  });
  const [result, setResult] = useState<ReviewsQueryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

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
      setResult(null);
      setSelectedReviewId(null);
      setLoading(false);
      return;
    }
    const loadReviews = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ hotelId: selectedHotelId });
        if (filters.sentiment) params.set("sentiment", filters.sentiment);
        if (filters.segment) params.set("segment", filters.segment);
        if (filters.topic) params.set("topic", filters.topic);
        if (filters.source) params.set("source", filters.source);
        if (filters.ratingMin) params.set("ratingMin", filters.ratingMin);
        if (filters.ratingMax) params.set("ratingMax", filters.ratingMax);
        if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) params.set("dateTo", filters.dateTo);
        if (filters.search) params.set("search", filters.search);

        const response = await fetchJson<ReviewsQueryResult>(
          `/api/reviews?${params.toString()}`
        );
        setResult(response);
        if (response.items[0]) {
          setSelectedReviewId((prev) => prev ?? response.items[0].review.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки отзывов.");
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      void loadReviews();
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [selectedHotelId, filters]);

  const selected = useMemo(
    () => result?.items.find((item) => item.review.id === selectedReviewId) ?? null,
    [result, selectedReviewId]
  );

  const selectedHotel = hotels.find((hotel) => hotel.id === selectedHotelId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Отзывы"
        subtitle="Фильтрация, поиск и объяснимый разбор каждого отзыва с переходом от текста к управленческому сигналу."
        badge="Анализ отзывов"
        rightSlot={result ? <Badge variant="default">{result.total} отзывов в выборке</Badge> : undefined}
      />

      <Card>
        <CardTitle
          kicker="Фильтры"
          title="Настройка выборки"
          subtitle="Сузьте корпус отзывов по тональности, сегменту, теме, источнику, периоду и текстовым признакам."
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
            value={filters.sentiment}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                sentiment: event.target.value as SentimentLabel | ""
              }))
            }
          >
            <option value="">Все тональности</option>
            <option value="positive">Позитив</option>
            <option value="neutral">Нейтрально</option>
            <option value="negative">Негатив</option>
          </Select>
          <Select
            value={filters.segment}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                segment: event.target.value as SegmentId | ""
              }))
            }
          >
            <option value="">Все сегменты</option>
            {SEGMENTS.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.topic}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                topic: event.target.value as TopicId | ""
              }))
            }
          >
            <option value="">Все темы</option>
            {TOPICS.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.source}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                source: event.target.value
              }))
            }
          >
            <option value="">Все источники</option>
            {REVIEW_SOURCE_PRIORITY.map((source) => (
              <option key={source} value={source}>
                {REVIEW_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Оценка от"
            value={filters.ratingMin}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                ratingMin: event.target.value
              }))
            }
          />
          <Input
            placeholder="Оценка до"
            value={filters.ratingMax}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                ratingMax: event.target.value
              }))
            }
          />
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                dateFrom: event.target.value
              }))
            }
          />
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                dateTo: event.target.value
              }))
            }
          />
          <Input
            className="md:col-span-2 xl:col-span-2"
            placeholder="Поиск по тексту отзыва или ключевым словам"
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                search: event.target.value
              }))
            }
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="info">Сценарий просмотра</Badge>
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
              viewMode === "table"
                ? "border-accent bg-accent text-white shadow-glow"
                : "border-border bg-panelSolid text-textMuted hover:text-text"
            }`}
            onClick={() => setViewMode("table")}
          >
            Таблица
          </button>
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-xs font-semibold transition-all ${
              viewMode === "cards"
                ? "border-accent bg-accent text-white shadow-glow"
                : "border-border bg-panelSolid text-textMuted hover:text-text"
            }`}
            onClick={() => setViewMode("cards")}
          >
            Карточки
          </button>
        </div>
      </Card>

      {loading && !result ? <LoadingState label="Загружаю отзывы..." /> : null}
      {error && !result ? <ErrorState title="Ошибка загрузки" description={error} /> : null}
      {!selectedHotelId && !loading ? (
        <EmptyState
          title="Выберите отель для просмотра отзывов"
          description="Сначала выберите объект в фильтре, затем применяйте тональность, темы и сегменты."
        />
      ) : null}

      {!loading && result && result.total === 0 ? (
        <EmptyState
          title="Отзывы не найдены"
          description="Измените фильтры или выполните новый сбор данных."
        />
      ) : null}

      {result && result.total > 0 ? (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardTitle
              kicker="Выборка отзывов"
              title={`Список отзывов (${result.total})`}
              subtitle={selectedHotel ? selectedHotel.name : ""}
            />
            {viewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-[0.1em] text-textMuted">
                      <th className="px-2 py-3">Дата</th>
                      <th className="px-2 py-3">Источник</th>
                      <th className="px-2 py-3">Оценка</th>
                      <th className="px-2 py-3">Тональность</th>
                      <th className="px-2 py-3">Сегмент</th>
                      <th className="px-2 py-3">Текст</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item) => (
                      <tr
                        key={item.review.id}
                        className="cursor-pointer border-b border-border hover:bg-panelMuted"
                        onClick={() => setSelectedReviewId(item.review.id)}
                      >
                        <td className="px-2 py-3">{formatDate(item.review.reviewDate)}</td>
                        <td className="px-2 py-3">
                          {REVIEW_SOURCE_LABELS[item.review.source] || item.review.source}
                        </td>
                        <td className="px-2 py-3">{item.review.rating.toFixed(1)}</td>
                        <td className="px-2 py-3">
                          <Badge variant={sentimentVariant(item.analysis.sentimentLabel)}>
                            {SENTIMENT_LABELS[item.analysis.sentimentLabel]}
                          </Badge>
                        </td>
                        <td className="px-2 py-3">{SEGMENT_LABELS[item.analysis.primarySegment]}</td>
                        <td className="max-w-[380px] truncate px-2 py-3">{item.review.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-2">
                {result.items.map((item) => (
                  <article
                    key={item.review.id}
                    className="cursor-pointer rounded-[1.15rem] border border-border bg-panelMuted p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-borderStrong"
                    onClick={() => setSelectedReviewId(item.review.id)}
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={sentimentVariant(item.analysis.sentimentLabel)}>
                        {SENTIMENT_LABELS[item.analysis.sentimentLabel]}
                      </Badge>
                      <Badge variant="info">{SEGMENT_LABELS[item.analysis.primarySegment]}</Badge>
                      <Badge variant="default">
                        {REVIEW_SOURCE_LABELS[item.review.source] || item.review.source}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm">{item.review.text}</p>
                    <p className="mt-1 text-xs text-textMuted">
                      {formatDate(item.review.reviewDate)} | оценка {item.review.rating.toFixed(1)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardTitle
              kicker="Объяснимость"
              title="Объяснение по отзыву"
              subtitle="Какие признаки дали текущую классификацию и как это трактуется менеджером объекта."
            />
            {selected ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant={sentimentVariant(selected.analysis.sentimentLabel)}>
                    {SENTIMENT_LABELS[selected.analysis.sentimentLabel]}
                  </Badge>
                  <Badge variant="info">{SEGMENT_LABELS[selected.analysis.primarySegment]}</Badge>
                  <Badge variant="default">
                    Уверенность {(selected.analysis.confidence * 100).toFixed(1)}%
                  </Badge>
                </div>
                <p>{selected.review.text}</p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-textMuted">
                    Темы
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.analysis.topics.map((topic) => (
                      <Badge key={topic.topic} variant="default">
                        {TOPIC_LABELS[topic.topic]} ({topic.sentimentScore.toFixed(2)})
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-textMuted">
                    Обоснование
                  </p>
                  <ul className="mt-2 space-y-2">
                    {selected.analysis.explanation.map((entry) => (
                      <li
                        key={`${entry.type}-${entry.title}`}
                        className="rounded-lg border border-border bg-panelMuted p-2"
                      >
                        <p className="font-semibold">{entry.title}</p>
                        <p className="text-xs text-textMuted">{entry.details}</p>
                        {entry.evidence.length ? (
                          <p className="mt-1 text-xs text-textMuted">
                            Основания: {entry.evidence.join("; ")}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-textMuted">Выберите отзыв из списка.</p>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}



