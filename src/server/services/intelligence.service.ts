import {
  AnalysisRun,
  CreateHotelRequest,
  DashboardPayload,
  ExecutiveSummary,
  IngestionImportRequest,
  IngestionPreviewResult,
  PlatformIngestionRequest,
  RecommendationPayload,
  SegmentAnalyticsPayload,
  SentimentLabel
} from "@/entities/types";
import { ANALYSIS_VERSION, DEFAULT_HOTEL_ID } from "@/shared/config/constants";
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
  const aggregate = ensureHotelAnalytics(hotelId);
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
  const aggregate = ensureHotelAnalytics(hotelId);
  if (!hotel || !aggregate) {
    throw new Error("Segment data not found");
  }

  return {
    hotel,
    segmentDistribution: aggregate.segmentDistribution,
    segmentInsights: aggregate.segmentInsights,
    markerNotes: [
      "Segmentation is probabilistic: one review can score across multiple segments.",
      "Primary segment is assigned only when confidence is sufficient.",
      "If top segment scores are too close, the review is marked as mixed."
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
  ensureHotelAnalytics(hotelId);
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
    throw new Error("Hotel not found");
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
    notes: "Platform ingestion started.",
    provider: request.provider,
    fetchedReviews: 0
  };
  repository.createRun(initialRun);

  void executePlatformIngestion(runId, request).catch(() => {
    // errors are handled inside executePlatformIngestion
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
      errorMessage: "Hotel not found for processing."
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
      notes: `${platformResult.notes.join(" ")} Duplicates skipped: ${normalized.duplicates}.`
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
        `${platformResult.notes.join(" ")} Duplicates skipped: ${normalized.duplicates}.` +
        ` Total reviews in storage: ${mergedReviews.length}.`
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
      errorMessage: error instanceof Error ? error.message : "Platform run failed"
    });
  }
}

function ensureHotelAnalytics(hotelId: string) {
  const repository = getRepository();
  const existing = repository.getAggregateByHotel(hotelId);
  if (existing) {
    return existing;
  }

  const currentReviews = repository.listReviewsByHotel(hotelId);
  const outcome = runAnalysisForHotel(hotelId, currentReviews, "seed");
  repository.upsertAnalytics(
    hotelId,
    currentReviews,
    outcome.analyses,
    outcome.aggregate,
    outcome.recommendations,
    outcome.run
  );
  return repository.getAggregateByHotel(hotelId);
}

function buildExecutiveSummary(
  aggregate: DashboardPayload["aggregate"]
): ExecutiveSummary {
  const overallSentimentLabel = toSentimentLabel(aggregate.overallSentiment);
  const keyInsight =
    aggregate.positiveDrivers[0] &&
    aggregate.segmentDistribution[0] &&
    `Strong theme "${aggregate.positiveDrivers[0].label}" supports segment "${SEGMENT_LABELS[aggregate.segmentDistribution[0].id]}".`;
  const keyRisk =
    aggregate.keyRisks[0] ??
    (aggregate.negativeDrivers[0]
      ? `Needs attention: ${aggregate.negativeDrivers[0].label}.`
      : "No critical risk detected at current sample size.");
  const keyOpportunity =
    aggregate.growthOpportunities[0] ??
    "Growth opportunity exists via stronger communication of proven strengths.";

  return {
    averageRating: aggregate.averageRating,
    totalReviews: aggregate.totalReviews,
    overallSentimentLabel,
    dominantSegment: aggregate.dominantSegment,
    keyInsight: keyInsight ?? "Not enough data for a strong executive conclusion.",
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
