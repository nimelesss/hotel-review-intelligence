import {
  AnalysisRun,
  DashboardPayload,
  ExecutiveSummary,
  IngestionImportRequest,
  IngestionPreviewResult,
  RecommendationPayload,
  SegmentAnalyticsPayload,
  SentimentLabel
} from "@/entities/types";
import { DEFAULT_HOTEL_ID } from "@/shared/config/constants";
import { SEGMENT_LABELS } from "@/shared/config/taxonomy";
import { buildIngestionPreview, normalizeForImport } from "@/server/ingestion/pipeline";
import { runAnalysisForHotel } from "@/server/analytics/run-analysis";
import { getRepository } from "@/server/repositories";

export function resolveHotelId(candidate?: string): string {
  const repository = getRepository();
  const hotels = repository.listHotels();
  if (candidate && repository.getHotelById(candidate)) {
    return candidate;
  }
  if (repository.getHotelById(DEFAULT_HOTEL_ID)) {
    return DEFAULT_HOTEL_ID;
  }
  return hotels[0]?.id ?? "";
}

export function getDashboardPayload(hotelIdRaw?: string): DashboardPayload {
  const repository = getRepository();
  const hotelId = resolveHotelId(hotelIdRaw);
  const hotel = repository.getHotelById(hotelId);
  if (!hotel) {
    throw new Error("Hotel not found");
  }
  const aggregate = repository.getAggregateByHotel(hotelId);
  if (!aggregate) {
    throw new Error("Aggregate not found");
  }
  const recommendationsPreview = repository
    .listRecommendationsByHotel(hotelId)
    .slice(0, 5);
  const reviewsResult = repository.queryReviews({ hotelId });
  const sampleExplainedReviews = reviewsResult.items.slice(0, 5);
  const latestRun = repository.listRunsByHotel(hotelId)[0];

  return {
    hotel,
    aggregate,
    recommendationsPreview,
    sampleExplainedReviews,
    latestRun,
    executiveSummary: buildExecutiveSummary(aggregate)
  };
}

export function getSegmentPayload(hotelIdRaw?: string): SegmentAnalyticsPayload {
  const repository = getRepository();
  const hotelId = resolveHotelId(hotelIdRaw);
  const hotel = repository.getHotelById(hotelId);
  const aggregate = repository.getAggregateByHotel(hotelId);
  if (!hotel || !aggregate) {
    throw new Error("Segment data not found");
  }

  return {
    hotel,
    segmentDistribution: aggregate.segmentDistribution,
    segmentInsights: aggregate.segmentInsights,
    markerNotes: [
      "Сегментация вероятностная: каждый отзыв получает веса по нескольким сегментам.",
      "Primary segment назначается только при достаточной уверенности.",
      "При низком разрыве между лидирующими сегментами используется класс mixed."
    ]
  };
}

export function getRecommendationPayload(
  hotelIdRaw?: string
): RecommendationPayload {
  const repository = getRepository();
  const hotelId = resolveHotelId(hotelIdRaw);
  const hotel = repository.getHotelById(hotelId);
  if (!hotel) {
    throw new Error("Hotel not found");
  }
  const recommendations = repository.listRecommendationsByHotel(hotelId);
  return {
    hotel,
    recommendations
  };
}

export function previewIngestion(
  request: IngestionImportRequest
): IngestionPreviewResult {
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

function buildExecutiveSummary(
  aggregate: DashboardPayload["aggregate"]
): ExecutiveSummary {
  const overallSentimentLabel = toSentimentLabel(aggregate.overallSentiment);
  const keyInsight =
    aggregate.positiveDrivers[0] &&
    aggregate.segmentDistribution[0] &&
    `Сильная тема "${aggregate.positiveDrivers[0].label}" поддерживает сегмент "${SEGMENT_LABELS[aggregate.segmentDistribution[0].id]}".`;
  const keyRisk =
    aggregate.keyRisks[0] ??
    (aggregate.negativeDrivers[0]
      ? `Требует внимания: ${aggregate.negativeDrivers[0].label}.`
      : "Явные критичные риски не выявлены.");
  const keyOpportunity =
    aggregate.growthOpportunities[0] ??
    "Есть потенциал роста через усиление подтвержденных преимуществ в коммуникациях.";

  return {
    averageRating: aggregate.averageRating,
    totalReviews: aggregate.totalReviews,
    overallSentimentLabel,
    dominantSegment: aggregate.dominantSegment,
    keyInsight: keyInsight ?? "Данных недостаточно для выраженного ключевого вывода.",
    keyRisk,
    keyOpportunity
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
