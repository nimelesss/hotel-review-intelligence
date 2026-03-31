import {
  AnalysisRun,
  CreateHotelRequest,
  DashboardDataHealth,
  DashboardPayload,
  ExecutiveSummary,
  IngestionImportRequest,
  IngestionPreviewResult,
  PlatformIngestionRequest,
  RecommendationPayload,
  Review,
  ReviewsQuery,
  ReviewSource,
  SegmentAnalyticsPayload,
  SentimentLabel,
  SourceCoverageItem
} from "@/entities/types";
import { ANALYSIS_VERSION, DEFAULT_HOTEL_ID } from "@/shared/config/constants";
import { REVIEW_SOURCE_LABELS, REVIEW_SOURCE_PRIORITY } from "@/shared/config/sources";
import { SEGMENT_LABELS } from "@/shared/config/taxonomy";
import { buildIngestionPreview, normalizeForImport } from "@/server/ingestion/pipeline";
import { normalizeRows } from "@/server/ingestion/normalize";
import { runAnalysisForHotel } from "@/server/analytics/run-analysis";
import { getRepository } from "@/server/repositories";
import { createId } from "@/shared/lib/id";
import { fetchPlatformReviews } from "@/server/platform-fetch";

export function resolveHotelId(candidate?: string): string {
  const repository = getRepository();
  const hotels = repository.listHotels();
  const reviewedHotels = hotels.filter((hotel) => (hotel.reviewCount ?? 0) > 0);

  if (candidate) {
    const selected = repository.getHotelById(candidate);
    return selected?.id ?? candidate;
  }

  const defaultHotel = repository.getHotelById(DEFAULT_HOTEL_ID);
  if (defaultHotel && (defaultHotel.reviewCount ?? 0) > 0) {
    return defaultHotel.id;
  }

  return reviewedHotels[0]?.id ?? hotels[0]?.id ?? "";
}

export function getDashboardPayload(hotelIdRaw?: string): DashboardPayload {
  const repository = getRepository();
  const hotelId = resolveHotelId(hotelIdRaw);
  const hotel = repository.getHotelById(hotelId);
  if (!hotel) {
    throw new Error("Отель не найден.");
  }

  const aggregate = ensureHotelAnalytics(hotelId);
  if (!aggregate) {
    throw new Error("Агрегированная аналитика по отелю недоступна.");
  }

  const recommendationsPreview = repository.listRecommendationsByHotel(hotelId).slice(0, 5);
  const reviewsResult = repository.queryReviews({ hotelId });
  const sampleExplainedReviews = reviewsResult.items.slice(0, 5);
  const latestRun = repository.listRunsByHotel(hotelId)[0];
  const sourceCoverage = buildSourceCoverage(hotelId);
  const dataHealth = buildDashboardDataHealth(sourceCoverage);

  return {
    hotel,
    aggregate,
    recommendationsPreview,
    sampleExplainedReviews,
    sourceCoverage,
    dataHealth,
    latestRun,
    executiveSummary: buildExecutiveSummary(aggregate)
  };
}

export function getSegmentPayload(hotelIdRaw?: string): SegmentAnalyticsPayload {
  const repository = getRepository();
  const hotelId = resolveHotelId(hotelIdRaw);
  const hotel = repository.getHotelById(hotelId);
  const aggregate = ensureHotelAnalytics(hotelId);
  if (!hotel || !aggregate) {
    throw new Error("Сегментные данные не найдены.");
  }

  return {
    hotel,
    segmentDistribution: aggregate.segmentDistribution,
    segmentInsights: aggregate.segmentInsights,
    markerNotes: [
      "Сегментация вероятностная: один отзыв может содержать сигналы нескольких сегментов.",
      "Основной сегмент присваивается только при достаточной уверенности.",
      "Если разрыв между сегментами мал, отзыв получает признак «смешанный профиль»."
    ]
  };
}

export function getRecommendationPayload(hotelIdRaw?: string): RecommendationPayload {
  const repository = getRepository();
  const hotelId = resolveHotelId(hotelIdRaw);
  const hotel = repository.getHotelById(hotelId);
  if (!hotel) {
    throw new Error("Отель не найден.");
  }
  ensureHotelAnalytics(hotelId);
  const recommendations = repository.listRecommendationsByHotel(hotelId);
  return {
    hotel,
    recommendations
  };
}

export function queryHotelReviews(
  query: Omit<ReviewsQuery, "hotelId"> & { hotelId?: string }
) {
  const repository = getRepository();
  const hotelId = resolveHotelId(query.hotelId);
  ensureHotelAnalytics(hotelId);
  return repository.queryReviews({
    ...query,
    hotelId
  });
}

export function previewIngestion(request: IngestionImportRequest): IngestionPreviewResult {
  const repository = getRepository();
  const hotelId = resolveHotelId(request.hotelId);
  const existingReviews = repository.listReviewsByHotel(hotelId);
  return buildIngestionPreview(
    {
      ...request,
      hotelId
    },
    existingReviews
  );
}

export function runIngestionImport(
  request: IngestionImportRequest
): {
  preview: IngestionPreviewResult;
  run: AnalysisRun;
} {
  const repository = getRepository();
  const hotelId = resolveHotelId(request.hotelId);
  const existingReviews = repository.listReviewsByHotel(hotelId);
  const prepared = normalizeForImport(
    {
      ...request,
      hotelId
    },
    existingReviews
  );
  const mergedReviews = [...existingReviews, ...prepared.reviews];
  const outcome = runAnalysisForHotel(hotelId, mergedReviews, request.sourceType);

  repository.upsertAnalytics(
    hotelId,
    mergedReviews,
    outcome.analyses,
    outcome.aggregate,
    outcome.recommendations,
    outcome.run
  );

  return {
    preview: prepared.preview,
    run: outcome.run
  };
}

export function createHotel(request: CreateHotelRequest) {
  const repository = getRepository();
  const hotel = repository.createHotel(request);
  ensureHotelAnalytics(hotel.id);
  return hotel;
}

export function startPlatformIngestionRun(request: PlatformIngestionRequest): AnalysisRun {
  const repository = getRepository();
  const hotelId = resolveHotelId(request.hotelId);
  const hotel = repository.getHotelById(hotelId);
  if (!hotel) {
    throw new Error("Отель не найден.");
  }

  const runId = createId("run-platform");
  const initialRun: AnalysisRun = {
    id: runId,
    hotelId,
    sourceType: "platform_api",
    totalReviewsProcessed: repository.listReviewsByHotel(hotelId).length,
    status: "running",
    startedAt: new Date().toISOString(),
    analysisVersion: ANALYSIS_VERSION,
    stage: "fetching_reviews",
    progressPct: 5,
    notes: "Запущен сбор отзывов по площадкам.",
    provider: request.provider,
    fetchedReviews: 0
  };
  repository.createRun(initialRun);

  void executePlatformIngestion(runId, request).catch(() => {
    // Ошибки обрабатываются внутри executePlatformIngestion.
  });

  return initialRun;
}

async function executePlatformIngestion(
  runId: string,
  request: PlatformIngestionRequest
): Promise<void> {
  const repository = getRepository();
  const run = repository.getRunById(runId);
  if (!run) {
    return;
  }
  const hotel = repository.getHotelById(run.hotelId);
  if (!hotel) {
    repository.updateRun(runId, {
      status: "failed",
      stage: "failed",
      progressPct: 100,
      completedAt: new Date().toISOString(),
      errorMessage: "Отель не найден в процессе обработки."
    });
    return;
  }

  try {
    repository.updateRun(runId, {
      stage: "fetching_reviews",
      progressPct: 12
    });

    const platformResult = await fetchPlatformReviews({
      provider: request.provider,
      hotel,
      query: request.query,
      limit: request.limit,
      language: request.language,
      datasetUrl: request.datasetUrl,
      apifyDatasetUrl: request.apifyDatasetUrl
    });

    repository.updateRun(runId, {
      stage: "normalizing_reviews",
      progressPct: 34
    });

    const existingReviews = repository.listReviewsByHotel(hotel.id);
    const normalized = normalizeRows(hotel.id, platformResult.rows, existingReviews);
    const mergedReviews = [...existingReviews, ...normalized.normalized];

    repository.updateRun(runId, {
      stage: "deduping_reviews",
      progressPct: 48,
      fetchedReviews: normalized.normalized.length,
      notes: `${platformResult.notes.join(" ")} Дубликатов пропущено: ${normalized.duplicates}.`
    });

    repository.updateRun(runId, {
      stage: "analyzing_reviews",
      progressPct: 64,
      fetchedReviews: normalized.normalized.length,
      notes: platformResult.notes.join(" ")
    });

    const outcome = runAnalysisForHotel(hotel.id, mergedReviews, "platform_api");

    repository.updateRun(runId, {
      stage: "aggregating_insights",
      progressPct: 86,
      fetchedReviews: normalized.normalized.length
    });

    const completedRun: AnalysisRun = {
      ...outcome.run,
      id: runId,
      startedAt: run.startedAt,
      status: "completed",
      progressPct: 100,
      stage: "completed",
      provider: request.provider,
      fetchedReviews: normalized.normalized.length,
      notes:
        `${platformResult.notes.join(" ")} Дубликатов пропущено: ${normalized.duplicates}.` +
        ` Всего отзывов в хранилище: ${mergedReviews.length}.`
    };

    repository.upsertAnalytics(
      hotel.id,
      mergedReviews,
      outcome.analyses,
      outcome.aggregate,
      outcome.recommendations,
      completedRun
    );
  } catch (error) {
    repository.updateRun(runId, {
      status: "failed",
      stage: "failed",
      progressPct: 100,
      completedAt: new Date().toISOString(),
      errorMessage:
        error instanceof Error ? error.message : "Ошибка сбора по внешним площадкам."
    });
  }
}

function ensureHotelAnalytics(hotelId: string) {
  const repository = getRepository();
  const currentReviews = repository.listReviewsByHotel(hotelId);
  const currentAnalyses = repository.listAnalysesByHotel(hotelId);
  const currentRecommendations = repository.listRecommendationsByHotel(hotelId);
  const currentAggregate = repository.getAggregateByHotel(hotelId);
  const latestRun = repository.listRunsByHotel(hotelId)[0];

  const aggregateMissing = !currentAggregate;
  const totalsMismatch =
    !!currentAggregate && currentAggregate.totalReviews !== currentReviews.length;
  const analysesMismatch = currentAnalyses.length !== currentReviews.length;
  const analysisVersionMismatch =
    currentAnalyses.some((analysis) => analysis.analysisVersion !== ANALYSIS_VERSION) ||
    (latestRun?.analysisVersion && latestRun.analysisVersion !== ANALYSIS_VERSION);
  const recommendationsMissing = currentRecommendations.length === 0;

  if (
    !aggregateMissing &&
    !totalsMismatch &&
    !analysesMismatch &&
    !analysisVersionMismatch &&
    !recommendationsMissing
  ) {
    return currentAggregate;
  }

  const outcome = runAnalysisForHotel(hotelId, currentReviews, "seed");
  repository.upsertAnalytics(
    hotelId,
    currentReviews,
    outcome.analyses,
    outcome.aggregate,
    outcome.recommendations,
    outcome.run
  );
  return outcome.aggregate;
}

function buildExecutiveSummary(aggregate: DashboardPayload["aggregate"]): ExecutiveSummary {
  const overallSentimentLabel = toSentimentLabel(aggregate.overallSentiment);
  const keyInsight =
    aggregate.positiveDrivers[0] && aggregate.segmentDistribution[0]
      ? `Сильная тема "${aggregate.positiveDrivers[0].label}" поддерживает сегмент "${SEGMENT_LABELS[aggregate.segmentDistribution[0].id]}".`
      : "Недостаточно данных для уверенного ключевого вывода.";
  const keyRisk =
    aggregate.keyRisks[0] ??
    (aggregate.negativeDrivers[0]
      ? `Требует контроля: ${aggregate.negativeDrivers[0].label}.`
      : "Критичных рисков на текущей выборке не выявлено.");
  const keyOpportunity =
    aggregate.growthOpportunities[0] ??
    "Потенциал роста: усилить в коммуникации подтвержденные сильные стороны.";

  return {
    averageRating: aggregate.averageRating,
    totalReviews: aggregate.totalReviews,
    overallSentimentLabel,
    dominantSegment: aggregate.dominantSegment,
    keyInsight,
    keyRisk,
    keyOpportunity
  };
}

function buildSourceCoverage(hotelId: string): SourceCoverageItem[] {
  const repository = getRepository();
  const reviews = repository.listReviewsByHotel(hotelId);
  const analyses = repository.listAnalysesByHotel(hotelId);
  const analysisMap = new Map(analyses.map((analysis) => [analysis.reviewId, analysis]));

  const grouped = new Map<
    ReviewSource,
    { reviews: Review[]; sentimentSum: number; sentimentCount: number }
  >();

  reviews.forEach((review) => {
    const bucket = grouped.get(review.source) || {
      reviews: [],
      sentimentSum: 0,
      sentimentCount: 0
    };
    bucket.reviews.push(review);
    const analysis = analysisMap.get(review.id);
    if (analysis) {
      bucket.sentimentSum += analysis.sentimentScore;
      bucket.sentimentCount += 1;
    }
    grouped.set(review.source, bucket);
  });

  const totalReviews = Math.max(reviews.length, 1);
  const items: SourceCoverageItem[] = [];

  grouped.forEach((bucket, source) => {
    const sortedByDate = bucket.reviews
      .map((review) => review.reviewDate)
      .sort((a, b) => b.localeCompare(a));
    const ratingSum = bucket.reviews.reduce((sum, review) => sum + review.rating, 0);
    items.push({
      source,
      label: REVIEW_SOURCE_LABELS[source] || source,
      reviews: bucket.reviews.length,
      share: bucket.reviews.length / totalReviews,
      averageRating: ratingSum / Math.max(bucket.reviews.length, 1),
      averageSentiment:
        bucket.sentimentSum / Math.max(bucket.sentimentCount, 1),
      lastReviewDate: sortedByDate[0]
    });
  });

  return items.sort((a, b) => {
    const priorityA = REVIEW_SOURCE_PRIORITY.indexOf(a.source);
    const priorityB = REVIEW_SOURCE_PRIORITY.indexOf(b.source);
    if (priorityA !== -1 && priorityB !== -1 && priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return b.reviews - a.reviews;
  });
}

function buildDashboardDataHealth(sourceCoverage: SourceCoverageItem[]): DashboardDataHealth {
  const sortedByDate = sourceCoverage
    .map((item) => item.lastReviewDate)
    .filter((date): date is string => !!date)
    .sort((a, b) => b.localeCompare(a));
  const lastReviewDate = sortedByDate[0];

  const trackedSources = sourceCoverage.length;
  const coreSources = sourceCoverage.filter((item) =>
    ["yandex", "2gis", "ostrovok"].includes(item.source)
  );
  const coreReviews = coreSources.reduce((sum, item) => sum + item.reviews, 0);

  const reviewCoverageSummary =
    coreSources.length > 0
      ? `Основные площадки (Яндекс, 2ГИС, Островок): ${coreReviews} отзывов.`
      : "Основные российские площадки пока не подключены или не содержат данных.";

  return {
    lastReviewDate,
    trackedSources,
    reviewCoverageSummary
  };
}

function toSentimentLabel(score: number): SentimentLabel {
  if (score > 0.2) {
    return "positive";
  }
  if (score < -0.2) {
    return "negative";
  }
  return "neutral";
}
