import {
  AnalysisRun,
  ExternalProfileSource,
  Hotel,
  HotelExternalProfile,
  PlatformProvider,
  ReviewFetchJob,
  ReviewFetchJobSource
} from "@/entities/types";
import { ANALYSIS_VERSION } from "@/shared/config/constants";
import { runAnalysisForHotel } from "@/server/analytics/run-analysis";
import { normalizeRows } from "@/server/ingestion/normalize";
import { fetchPlatformReviews } from "@/server/platform-fetch";
import { getRepository } from "@/server/repositories";
import { createId } from "@/shared/lib/id";

export interface StartReviewFetchJobRequest {
  hotelId: string;
  triggerType?: ReviewFetchJob["triggerType"];
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface ReviewFetchJobResult {
  job: ReviewFetchJob;
  run: AnalysisRun;
  warnings: string[];
}

export interface ReviewFetchJobPayload {
  job: ReviewFetchJob;
  sources: ReviewFetchJobSource[];
  latestRun?: AnalysisRun;
}

interface SourcePlanItem {
  source: ExternalProfileSource;
  provider: PlatformProvider;
  query: string;
}

const DEFAULT_FETCH_LIMIT_PER_SOURCE = 300;

export function startReviewFetchJob(request: StartReviewFetchJobRequest): ReviewFetchJobResult {
  const repository = getRepository();
  const hotel = repository.getHotelById(request.hotelId);
  if (!hotel) {
    throw new Error("hotelId not found.");
  }

  const now = new Date().toISOString();
  const triggerType = request.triggerType || "manual";

  const run: AnalysisRun = {
    id: createId("run-realtime"),
    hotelId: hotel.id,
    sourceType: "platform_api",
    totalReviewsProcessed: repository.listReviewsByHotel(hotel.id).length,
    status: "running",
    startedAt: now,
    analysisVersion: ANALYSIS_VERSION,
    stage: "fetching_reviews",
    progressPct: 3,
    notes: "Инициализация job сбора отзывов.",
    fetchedReviews: 0
  };
  repository.createRun(run);

  const job: ReviewFetchJob = {
    id: createId("review-fetch-job"),
    hotelId: hotel.id,
    triggerType,
    fromDate: request.fromDate,
    toDate: request.toDate,
    status: "queued",
    progressPct: 0,
    currentStage: "queued",
    totalCollected: 0,
    warningCount: 0,
    startedAt: now,
    createdAt: now,
    updatedAt: now
  };
  repository.createReviewFetchJob(job);

  const plans = createSourcePlans(hotel);
  const sourceRows = plans.map((plan) => {
    const source: ReviewFetchJobSource = {
      id: createId("review-fetch-source"),
      jobId: job.id,
      source: plan.source,
      status: "queued",
      collectedCount: 0,
      updatedAt: now
    };
    repository.createReviewFetchJobSource(source);
    return source;
  });

  const warnings: string[] = [];
  void executeReviewFetchJob(job.id, run.id, hotel, plans, sourceRows, request, warnings).catch(
    (error) => {
      repository.updateReviewFetchJob(job.id, {
        status: "failed",
        currentStage: "failed",
        progressPct: 100,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Ошибка выполнения job сбора отзывов.",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      repository.updateRun(run.id, {
        status: "failed",
        stage: "failed",
        progressPct: 100,
        completedAt: new Date().toISOString(),
        errorMessage:
          error instanceof Error
            ? error.message
            : "Ошибка выполнения job сбора отзывов."
      });
    }
  );

  return {
    job,
    run,
    warnings
  };
}

export function getReviewFetchJobPayload(jobId: string): ReviewFetchJobPayload {
  const repository = getRepository();
  const job = repository.getReviewFetchJobById(jobId);
  if (!job) {
    throw new Error("Review fetch job not found.");
  }

  const latestRun = repository.listRunsByHotel(job.hotelId)[0];
  return {
    job,
    sources: repository.listReviewFetchJobSources(jobId),
    latestRun
  };
}

export function listReviewFetchJobsByHotel(hotelId: string, limit = 20): ReviewFetchJobPayload[] {
  const repository = getRepository();
  const jobs = repository.listReviewFetchJobsByHotel(hotelId, limit);
  return jobs.map((job) => ({
    job,
    sources: repository.listReviewFetchJobSources(job.id),
    latestRun: repository.listRunsByHotel(job.hotelId)[0]
  }));
}

function createSourcePlans(hotel: Hotel): SourcePlanItem[] {
  const query = `${hotel.name} ${hotel.city}`.trim();
  return [
    {
      source: "yandex",
      provider: "yandex_maps_dataset",
      query
    },
    {
      source: "2gis",
      provider: "two_gis_dataset",
      query
    }
  ];
}

async function executeReviewFetchJob(
  jobId: string,
  runId: string,
  hotel: Hotel,
  plans: SourcePlanItem[],
  sourceRows: ReviewFetchJobSource[],
  request: StartReviewFetchJobRequest,
  warnings: string[]
) {
  const repository = getRepository();
  const startedAt = new Date().toISOString();
  repository.updateReviewFetchJob(jobId, {
    status: "running",
    currentStage: "resolving_profiles",
    progressPct: 6,
    startedAt,
    updatedAt: startedAt
  });
  repository.updateRun(runId, {
    status: "running",
    stage: "fetching_reviews",
    progressPct: 8,
    notes: "Профили площадок сопоставлены. Запускаем сбор отзывов."
  });

  ensureExternalProfiles(hotel, plans.map((plan) => plan.source));

  const allRows: Array<{
    plan: SourcePlanItem;
    rows: Awaited<ReturnType<typeof fetchPlatformReviews>>["rows"];
    notes: string[];
    sourceRowId: string;
  }> = [];

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const sourceRow = sourceRows[index];
    const sourceStart = new Date().toISOString();
    repository.updateReviewFetchJobSource(sourceRow.id, {
      status: "running",
      startedAt: sourceStart,
      updatedAt: sourceStart
    });
    repository.updateReviewFetchJob(jobId, {
      currentStage: "fetching_reviews",
      progressPct: 12 + Math.floor((index / Math.max(plans.length, 1)) * 30),
      updatedAt: new Date().toISOString()
    });
    repository.updateRun(runId, {
      stage: "fetching_reviews",
      progressPct: 14 + Math.floor((index / Math.max(plans.length, 1)) * 24),
      notes: `Сбор отзывов из источника ${plan.source}.`
    });

    try {
      const fetched = await fetchPlatformReviews({
        provider: plan.provider,
        hotel,
        query: plan.query,
        language: "ru",
        limit: clampLimit(request.limit)
      });

      const sourceDone = new Date().toISOString();
      repository.updateReviewFetchJobSource(sourceRow.id, {
        status: "completed",
        collectedCount: fetched.rows.length,
        notes: fetched.notes.join(" "),
        completedAt: sourceDone,
        updatedAt: sourceDone
      });

      allRows.push({
        plan,
        rows: fetched.rows,
        notes: fetched.notes,
        sourceRowId: sourceRow.id
      });
    } catch (error) {
      const sourceDone = new Date().toISOString();
      const message =
        error instanceof Error ? error.message : "Ошибка запроса к источнику.";
      repository.updateReviewFetchJobSource(sourceRow.id, {
        status: "failed",
        errorMessage: message,
        completedAt: sourceDone,
        updatedAt: sourceDone
      });
      warnings.push(`${plan.source}: ${message}`);
    }
  }

  const fetchedRows = allRows.flatMap((item) => item.rows);
  const totalCollected = fetchedRows.length;
  repository.updateRun(runId, {
    stage: "normalizing_reviews",
    progressPct: 44,
    fetchedReviews: totalCollected,
    notes: totalCollected
      ? `Собрано ${totalCollected} новых отзывов. Запущена нормализация.`
      : "Новых отзывов не получено, проверяем локальные данные."
  });

  if (!totalCollected) {
    const existingReviews = repository.listReviewsByHotel(hotel.id);
    if (!existingReviews.length) {
      const failedAt = new Date().toISOString();
      repository.updateReviewFetchJob(jobId, {
        status: "failed",
        currentStage: "failed",
        progressPct: 100,
        totalCollected: 0,
        warningCount: warnings.length,
        errorMessage: "No reviews collected from configured sources and local store is empty.",
        completedAt: failedAt,
        updatedAt: failedAt
      });
      repository.updateRun(runId, {
        status: "failed",
        stage: "failed",
        progressPct: 100,
        completedAt: failedAt,
        errorMessage:
          "No reviews collected from configured sources and local store is empty.",
        notes: warnings.join(" | ")
      });
      return;
    }

    repository.updateReviewFetchJob(jobId, {
      currentStage: "analyzing_reviews",
      progressPct: 74,
      updatedAt: new Date().toISOString()
    });
    repository.updateRun(runId, {
      stage: "analyzing_reviews",
      progressPct: 76,
      notes:
        "Новые отзывы не получены. Выполняем пересчет аналитики по локальной базе отзывов."
    });
    const outcome = runAnalysisForHotel(hotel.id, existingReviews, "seed");
    const completedAt = new Date().toISOString();
    const completedRun: AnalysisRun = {
      ...outcome.run,
      id: runId,
      hotelId: hotel.id,
      sourceType: "platform_api",
      startedAt: repository.getRunById(runId)?.startedAt || startedAt,
      completedAt,
      status: "completed",
      progressPct: 100,
      stage: "completed",
      fetchedReviews: 0,
      notes: `Новые отзывы не получены; аналитика обновлена по ${existingReviews.length} локальным отзывам.`
    };
    repository.upsertAnalytics(
      hotel.id,
      existingReviews,
      outcome.analyses,
      outcome.aggregate,
      outcome.recommendations,
      completedRun
    );
    repository.updateReviewFetchJob(jobId, {
      status: "completed",
      currentStage: "completed",
      progressPct: 100,
      totalCollected: 0,
      warningCount: warnings.length,
      completedAt,
      updatedAt: completedAt
    });
    return;
  }

  const existingReviews = repository.listReviewsByHotel(hotel.id);

  repository.updateReviewFetchJob(jobId, {
    currentStage: "normalizing_reviews",
    progressPct: 52,
    updatedAt: new Date().toISOString()
  });
  const normalized = normalizeRows(hotel.id, fetchedRows, existingReviews);
  const mergedReviews = [...existingReviews, ...normalized.normalized];

  repository.updateReviewFetchJob(jobId, {
    currentStage: "deduping_reviews",
    progressPct: 64,
    totalCollected: normalized.normalized.length,
    warningCount: warnings.length,
    updatedAt: new Date().toISOString()
  });
  repository.updateRun(runId, {
    stage: "deduping_reviews",
    progressPct: 66,
    fetchedReviews: normalized.normalized.length,
    notes: `Нормализовано ${normalized.normalized.length}, дублей пропущено ${normalized.duplicates}.`
  });

  repository.updateReviewFetchJob(jobId, {
    currentStage: "analyzing_reviews",
    progressPct: 78,
    updatedAt: new Date().toISOString()
  });
  repository.updateRun(runId, {
    stage: "analyzing_reviews",
    progressPct: 80
  });

  const outcome = runAnalysisForHotel(hotel.id, mergedReviews, "platform_api");

  repository.updateReviewFetchJob(jobId, {
    currentStage: "aggregating_insights",
    progressPct: 92,
    updatedAt: new Date().toISOString()
  });
  repository.updateRun(runId, {
    stage: "aggregating_insights",
    progressPct: 94
  });

  const completedAt = new Date().toISOString();
  const completedRun: AnalysisRun = {
    ...outcome.run,
    id: runId,
    hotelId: hotel.id,
    sourceType: "platform_api",
    startedAt: repository.getRunById(runId)?.startedAt || startedAt,
    completedAt,
    status: "completed",
    stage: "completed",
    progressPct: 100,
    fetchedReviews: normalized.normalized.length,
    notes: composeCompletionNotes(normalized.normalized.length, normalized.duplicates, warnings)
  };

  repository.upsertAnalytics(
    hotel.id,
    mergedReviews,
    outcome.analyses,
    outcome.aggregate,
    outcome.recommendations,
    completedRun
  );

  repository.updateReviewFetchJob(jobId, {
    status: "completed",
    currentStage: "completed",
    progressPct: 100,
    totalCollected: normalized.normalized.length,
    warningCount: warnings.length,
    completedAt,
    updatedAt: completedAt
  });
}

function ensureExternalProfiles(
  hotel: Hotel,
  sources: ExternalProfileSource[]
) {
  const repository = getRepository();
  const existingBySource = new Map(
    repository.listExternalProfilesByHotel(hotel.id).map((profile) => [profile.source, profile])
  );
  const now = new Date().toISOString();

  sources.forEach((source) => {
    if (existingBySource.has(source)) {
      return;
    }
    const fallbackProfile: HotelExternalProfile = {
      id: createId("external-profile"),
      hotelId: hotel.id,
      source,
      externalId: hotel.externalId,
      externalName: hotel.name,
      externalAddress: hotel.address,
      latitude: hotel.coordinates?.lat,
      longitude: hotel.coordinates?.lon,
      matchConfidence: 0.2,
      isActive: true,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now
    };
    repository.upsertExternalProfile(fallbackProfile);
  });
}

function composeCompletionNotes(
  collected: number,
  duplicates: number,
  warnings: string[]
): string {
  const parts = [
    `Собрано новых отзывов: ${collected}.`,
    `Дубликатов пропущено: ${duplicates}.`
  ];
  if (warnings.length) {
    parts.push(`Предупреждений: ${warnings.length}.`);
  }
  return parts.join(" ");
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_FETCH_LIMIT_PER_SOURCE;
  }
  return Math.max(25, Math.min(1000, Math.floor(limit || DEFAULT_FETCH_LIMIT_PER_SOURCE)));
}
