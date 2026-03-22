import {
  AnalysisRun,
  Hotel,
  PlatformIngestionRequest,
  PlatformProvider
} from "@/entities/types";
import { ANALYSIS_VERSION } from "@/shared/config/constants";
import { runAnalysisForHotel } from "@/server/analytics/run-analysis";
import { getRepository } from "@/server/repositories";
import { startPlatformIngestionRun } from "@/server/services/intelligence.service";
import { canFetchWithoutDatasetUrl } from "@/server/platform-fetch/providers/apify-dataset";
import { createId } from "@/shared/lib/id";
import { normalizeSearchText } from "@/shared/lib/text";

type SyncMode = "manual" | "weekly";

interface RawPortfolioTarget {
  hotelId?: string;
  hotelName?: string;
  provider?: string;
  datasetUrl?: string;
  datasetUrlTemplate?: string;
  query?: string;
  language?: string;
  limit?: number;
  enabled?: boolean;
}

interface PortfolioTarget {
  hotelId?: string;
  hotelName?: string;
  provider: PlatformProvider;
  datasetUrl?: string;
  datasetUrlTemplate?: string;
  query?: string;
  language: string;
  limit?: number;
  enabled: boolean;
}

interface RawFallbackTarget {
  provider?: string;
  datasetUrl?: string;
  datasetUrlTemplate?: string;
  query?: string;
  language?: string;
  limit?: number;
  enabled?: boolean;
}

interface FallbackTarget {
  provider: PlatformProvider;
  datasetUrl?: string;
  datasetUrlTemplate?: string;
  query?: string;
  language: string;
  limit?: number;
  enabled: boolean;
}

export interface PortfolioSyncResult {
  mode: SyncMode;
  startedAt: string;
  targetsTotal: number;
  targetsStarted: number;
  hotelsCovered: number;
  runs: AnalysisRun[];
  warnings: string[];
}

export interface PortfolioSyncReadiness {
  targetsTotal: number;
  hotelsInSystem: number;
  hotelsCovered: number;
  providers: PlatformProvider[];
  hotelsWithoutTargets: string[];
}

const PROVIDERS = new Set<PlatformProvider>([
  "yandex_maps_dataset",
  "two_gis_dataset",
  "ostrovok_dataset",
  "russian_travel_dataset",
  "apify_dataset"
]);

const DEFAULT_INCLUDE_FALLBACK_UNCOVERED = true;

export function getPortfolioSyncReadiness(): PortfolioSyncReadiness {
  const repository = getRepository();
  const hotels = repository.listHotels();
  const explicitTargets = readPortfolioTargets().filter((target) => target.enabled);
  const fallbackTargets = readFallbackTargets().filter((target) => target.enabled);

  const resolvedHotelIds = new Set<string>();
  const providers = new Set<PlatformProvider>();

  explicitTargets.forEach((target) => {
    const hotelId = resolveTargetHotelId(target);
    if (!hotelId) {
      return;
    }
    resolvedHotelIds.add(hotelId);
    providers.add(target.provider);
  });

  fallbackTargets.forEach((target) => providers.add(target.provider));

  const fallbackCoversAllHotels = fallbackTargets.length > 0;
  const hotelsWithoutTargets = fallbackCoversAllHotels
    ? []
    : hotels.filter((hotel) => !resolvedHotelIds.has(hotel.id)).map((hotel) => hotel.name);

  const hotelsCovered = fallbackCoversAllHotels ? hotels.length : resolvedHotelIds.size;

  const targetsTotal =
    explicitTargets.length +
    (fallbackCoversAllHotels ? fallbackTargets.length * Math.max(hotels.length, 1) : 0);

  return {
    targetsTotal,
    hotelsInSystem: hotels.length,
    hotelsCovered,
    providers: [...providers],
    hotelsWithoutTargets
  };
}

export function startPortfolioSync(mode: SyncMode, hotelIds?: string[]): PortfolioSyncResult {
  const explicitTargets = readPortfolioTargets().filter((target) => target.enabled);
  const fallbackTargets = readFallbackTargets().filter((target) => target.enabled);

  if (!explicitTargets.length && !fallbackTargets.length) {
    throw new Error(
      "Источники синхронизации не настроены. Укажите PORTFOLIO_SYNC_TARGETS_JSON и/или DEFAULT_REALTIME_TARGETS_JSON."
    );
  }

  const repository = getRepository();
  const allHotels = repository.listHotels();
  const hotelsScope = resolveHotelsScope(allHotels, hotelIds);
  if (!hotelsScope.length) {
    throw new Error("В системе нет отелей для запуска синхронизации.");
  }

  const scopeSet = new Set(hotelsScope.map((hotel) => hotel.id));
  const warnings: string[] = [];
  const runs: AnalysisRun[] = [];
  const coveredHotels = new Set<string>();
  const coveredByExplicit = new Set<string>();

  explicitTargets.forEach((target) => {
    const hotelId = resolveTargetHotelId(target);
    if (!hotelId) {
      warnings.push(
        `Источник пропущен: не удалось сопоставить отель (${target.hotelId || target.hotelName || "unknown"}).`
      );
      return;
    }
    if (!scopeSet.has(hotelId)) {
      return;
    }

    const run = runTargetForHotel(hotelId, target, warnings);
    if (run) {
      runs.push(run);
      coveredHotels.add(hotelId);
      coveredByExplicit.add(hotelId);
    }
  });

  const includeFallbackForUncovered = shouldIncludeFallbackForUncovered(mode);
  if (fallbackTargets.length && includeFallbackForUncovered) {
    hotelsScope.forEach((hotel) => {
      if (coveredByExplicit.has(hotel.id)) {
        return;
      }
      const runsBefore = runs.length;
      fallbackTargets.forEach((target) => {
        const run = runFallbackForHotel(hotel, target, warnings);
        if (run) {
          runs.push(run);
        }
      });
      if (runs.length > runsBefore) {
        coveredHotels.add(hotel.id);
      }
    });
  }

  const explicitTotal = explicitTargets.filter((target) => {
    const hotelId = resolveTargetHotelId(target);
    return !!hotelId && scopeSet.has(hotelId);
  }).length;

  const fallbackHotelsCount =
    includeFallbackForUncovered && fallbackTargets.length
      ? hotelsScope.filter((hotel) => !coveredByExplicit.has(hotel.id)).length
      : 0;

  const targetsTotal = explicitTotal + fallbackHotelsCount * fallbackTargets.length;

  return {
    mode,
    startedAt: new Date().toISOString(),
    targetsTotal,
    targetsStarted: runs.length,
    hotelsCovered: coveredHotels.size,
    runs,
    warnings
  };
}

export function startRealtimeSyncForHotel(hotelIdRaw: string): PortfolioSyncResult {
  const repository = getRepository();
  const hotelId = hotelIdRaw.trim();
  const hotel = hotelId ? repository.getHotelById(hotelId) : undefined;
  if (!hotel) {
    throw new Error("hotelId not found.");
  }

  const explicitTargets = readPortfolioTargets().filter((target) => target.enabled);
  const matchingTargets = explicitTargets.filter((target) => resolveTargetHotelId(target) === hotelId);

  const warnings: string[] = [];
  const runs: AnalysisRun[] = [];

  // Safety net for manually created duplicates:
  // if selected profile has no reviews, try to bootstrap from canonical local hotel with reviews.
  const bootstrapRun = bootstrapFromCanonicalLocalHotelIfNeeded(hotel);
  if (bootstrapRun) {
    runs.push(bootstrapRun);
  }

  if (matchingTargets.length) {
    matchingTargets.forEach((target) => {
      const run = runTargetForHotel(hotelId, target, warnings);
      if (run) {
        runs.push(run);
      }
    });
  } else {
    const fallbackTargets = readFallbackTargets().filter((target) => target.enabled);
    if (!fallbackTargets.length) {
      const localRun = runLocalReanalysisIfPossible(
        hotel.id,
        "External providers are not configured. Analytics recalculated from local review store."
      );
      if (localRun) {
        runs.push(localRun);
      } else {
        warnings.push(
          "External providers are not configured, and selected hotel has no local reviews yet."
        );
      }
    } else {
      fallbackTargets.forEach((target) => {
        const run = runFallbackForHotel(hotel, target, warnings);
        if (run) {
          runs.push(run);
        }
      });
    }
  }

  if (!runs.length) {
    const localRun = runLocalReanalysisIfPossible(
      hotel.id,
      "External sources are unavailable. Analytics recalculated from local review store."
    );
    if (localRun) {
      runs.push(localRun);
      warnings.push("External sources unavailable: local analytics recalculation completed.");
    }
  }

  if (!runs.length) {
    const failedRun = createFailedRealtimeRun(
      hotel.id,
      "No local reviews and no configured external providers for this hotel."
    );
    runs.push(failedRun);
  }

  return {
    mode: "manual",
    startedAt: new Date().toISOString(),
    targetsTotal: runs.length,
    targetsStarted: runs.length,
    hotelsCovered: runs.length ? 1 : 0,
    runs,
    warnings
  };
}

function bootstrapFromCanonicalLocalHotelIfNeeded(hotel: Hotel): AnalysisRun | null {
  const repository = getRepository();
  const currentReviews = repository.listReviewsByHotel(hotel.id);
  if (currentReviews.length > 0) {
    return null;
  }

  const donor = findCanonicalDonorHotel(hotel, repository.listHotels());
  if (!donor) {
    return null;
  }

  const donorReviews = repository.listReviewsByHotel(donor.id);
  if (!donorReviews.length) {
    return null;
  }

  const now = new Date().toISOString();
  const clonedReviews = donorReviews.map((review) => ({
    ...review,
    id: createId("review-clone"),
    hotelId: hotel.id,
    sourceReviewId: review.sourceReviewId
      ? `${review.sourceReviewId}|alias:${hotel.id}`
      : undefined,
    createdAt: now,
    updatedAt: now
  }));

  const outcome = runAnalysisForHotel(hotel.id, clonedReviews, "seed");
  const run: AnalysisRun = {
    id: createId("run-canonical-bootstrap"),
    hotelId: hotel.id,
    sourceType: "seed",
    totalReviewsProcessed: clonedReviews.length,
    status: "completed",
    startedAt: now,
    completedAt: now,
    analysisVersion: ANALYSIS_VERSION,
    notes: `Local bootstrap from canonical hotel "${donor.name}" (${donor.city}).`,
    progressPct: 100,
    stage: "completed",
    fetchedReviews: clonedReviews.length
  };

  repository.upsertAnalytics(
    hotel.id,
    clonedReviews,
    outcome.analyses,
    outcome.aggregate,
    outcome.recommendations,
    run
  );

  return run;
}

function findCanonicalDonorHotel(hotel: Hotel, hotels: Hotel[]): Hotel | null {
  if (hotel.externalId) {
    const donorById = hotels.find(
      (candidate) => candidate.id === hotel.externalId && (candidate.reviewCount ?? 0) > 0
    );
    if (donorById) {
      return donorById;
    }

    const donorByExternal = hotels.find(
      (candidate) =>
        candidate.externalId === hotel.externalId && (candidate.reviewCount ?? 0) > 0
    );
    if (donorByExternal) {
      return donorByExternal;
    }
  }

  const hotelName = normalizeIdentity(hotel.name);
  const hotelCity = normalizeIdentity(hotel.city);
  if (!hotelName) {
    return null;
  }

  const candidates = hotels
    .filter((candidate) => candidate.id !== hotel.id && (candidate.reviewCount ?? 0) > 0)
    .map((candidate) => ({
      candidate,
      score: scoreDonorCandidate(hotelName, hotelCity, candidate)
    }))
    .filter((item) => item.score >= 75)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.candidate ?? null;
}

function scoreDonorCandidate(
  hotelName: string,
  hotelCity: string,
  candidate: Pick<Hotel, "name" | "city">
): number {
  const candidateName = normalizeIdentity(candidate.name);
  const candidateCity = normalizeIdentity(candidate.city);

  let score = 0;
  if (candidateName === hotelName) {
    score += 140;
  }
  if (candidateName.includes(hotelName) || hotelName.includes(candidateName)) {
    score += 80;
  }
  if (hotelCity && candidateCity === hotelCity) {
    score += 40;
  }
  if (!hotelCity) {
    score += 15;
  }
  return score;
}

function normalizeIdentity(value: string): string {
  const normalized = normalizeSearchText(value)
    .replace(
      /\b(\u043e\u0442\u0435\u043b\u044c|\u0433\u043e\u0441\u0442\u0438\u043d\u0438\u0446\u0430|hotel|hostel|by|marriott|inn|resort)\b/giu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  const transliterated = transliterateCyrillicToLatin(normalized);
  return [normalized, transliterated].join(" ").trim();
}

function transliterateCyrillicToLatin(value: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya"
  };

  return [...value]
    .map((char) => map[char.toLocaleLowerCase("ru-RU")] ?? char)
    .join("");
}

function runLocalReanalysisIfPossible(
  hotelId: string,
  notes: string
): AnalysisRun | null {
  const repository = getRepository();
  const existingReviews = repository.listReviewsByHotel(hotelId);
  if (!existingReviews.length) {
    return null;
  }

  const outcome = runAnalysisForHotel(hotelId, existingReviews, "seed");
  const now = new Date().toISOString();
  const run: AnalysisRun = {
    id: createId("run-local-rebuild"),
    hotelId,
    sourceType: "seed",
    totalReviewsProcessed: existingReviews.length,
    status: "completed",
    startedAt: now,
    completedAt: now,
    analysisVersion: ANALYSIS_VERSION,
    notes,
    progressPct: 100,
    stage: "completed",
    fetchedReviews: existingReviews.length
  };

  repository.upsertAnalytics(
    hotelId,
    existingReviews,
    outcome.analyses,
    outcome.aggregate,
    outcome.recommendations,
    run
  );

  return run;
}

function createFailedRealtimeRun(hotelId: string, errorMessage: string): AnalysisRun {
  const repository = getRepository();
  const now = new Date().toISOString();
  const run: AnalysisRun = {
    id: createId("run-local-failed"),
    hotelId,
    sourceType: "platform_api",
    totalReviewsProcessed: repository.listReviewsByHotel(hotelId).length,
    status: "failed",
    startedAt: now,
    completedAt: now,
    analysisVersion: ANALYSIS_VERSION,
    notes: "Realtime collection could not start for selected hotel.",
    progressPct: 100,
    stage: "failed",
    errorMessage
  };

  repository.createRun(run);
  return run;
}

function resolveHotelsScope(allHotels: Hotel[], hotelIds?: string[]): Hotel[] {
  if (!hotelIds?.length) {
    return allHotels;
  }

  const idSet = new Set(
    hotelIds
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  );

  return allHotels.filter((hotel) => idSet.has(hotel.id));
}

function runTargetForHotel(
  hotelId: string,
  target: PortfolioTarget,
  warnings: string[]
): AnalysisRun | null {
  const repository = getRepository();
  const hotel = repository.getHotelById(hotelId);
  if (!hotel) {
    warnings.push(`Источник пропущен: отель ${hotelId} не найден.`);
    return null;
  }

  try {
    const request = buildPlatformRequestForHotel(hotel, target);
    return startPlatformIngestionRun(request);
  } catch (error) {
    warnings.push(
      `Источник ${target.provider} для отеля "${hotel.name}" завершился ошибкой: ${
        error instanceof Error ? error.message : "неизвестная ошибка"
      }`
    );
    return null;
  }
}

function runFallbackForHotel(
  hotel: Hotel,
  target: FallbackTarget,
  warnings: string[]
): AnalysisRun | null {
  try {
    const request = buildPlatformRequestForHotel(hotel, target);
    return startPlatformIngestionRun(request);
  } catch (error) {
    warnings.push(
      `Fallback-источник ${target.provider} для отеля "${hotel.name}" завершился ошибкой: ${
        error instanceof Error ? error.message : "неизвестная ошибка"
      }`
    );
    return null;
  }
}

type TargetBase = {
  provider: PlatformProvider;
  datasetUrl?: string;
  datasetUrlTemplate?: string;
  query?: string;
  language: string;
  limit?: number;
};

function buildPlatformRequestForHotel(
  hotel: Hotel,
  target: TargetBase
): PlatformIngestionRequest {
  const baseQuery = `${hotel.name} ${hotel.city}`.trim();
  const query = interpolateQueryTemplate(target.query || baseQuery, hotel, baseQuery, target.provider);
  const datasetUrl = resolveDatasetUrl(
    hotel,
    target.provider,
    target.datasetUrl,
    target.datasetUrlTemplate,
    query
  );

  if (!datasetUrl && !canFetchWithoutDatasetUrl(target.provider)) {
    throw new Error(
      `Для провайдера ${target.provider} не указан datasetUrl/datasetUrlTemplate и не настроен runtime collector.`
    );
  }

  return {
    hotelId: hotel.id,
    provider: target.provider,
    datasetUrl: datasetUrl || undefined,
    query,
    language: target.language || "ru",
    limit: target.limit
  };
}

function resolveDatasetUrl(
  hotel: Hotel,
  provider: PlatformProvider,
  datasetUrl?: string,
  datasetUrlTemplate?: string,
  query?: string
): string {
  const raw = (datasetUrlTemplate || datasetUrl || "").trim();
  if (!raw) {
    return "";
  }

  const querySafe = query || `${hotel.name} ${hotel.city}`.trim();

  return raw
    .replaceAll("{provider}", encodeURIComponent(provider))
    .replaceAll("{hotelId}", encodeURIComponent(hotel.id))
    .replaceAll("{hotelName}", encodeURIComponent(hotel.name))
    .replaceAll("{city}", encodeURIComponent(hotel.city))
    .replaceAll("{country}", encodeURIComponent(hotel.country))
    .replaceAll("{queryEncoded}", encodeURIComponent(querySafe))
    .replaceAll("{query}", encodeURIComponent(querySafe));
}

function interpolateQueryTemplate(
  template: string,
  hotel: Hotel,
  query: string,
  provider: PlatformProvider
): string {
  return template
    .replaceAll("{provider}", provider)
    .replaceAll("{hotelId}", hotel.id)
    .replaceAll("{hotelName}", hotel.name)
    .replaceAll("{city}", hotel.city)
    .replaceAll("{country}", hotel.country)
    .replaceAll("{query}", query)
    .trim();
}

function shouldIncludeFallbackForUncovered(mode: SyncMode): boolean {
  if (mode === "weekly") {
    return true;
  }

  const raw = (process.env.PORTFOLIO_SYNC_INCLUDE_FALLBACK_UNCOVERED || "").trim();
  if (!raw) {
    return DEFAULT_INCLUDE_FALLBACK_UNCOVERED;
  }

  const normalized = raw.toLocaleLowerCase("ru-RU");
  return ["1", "true", "yes", "on"].includes(normalized);
}

function readPortfolioTargets(): PortfolioTarget[] {
  const raw = process.env.PORTFOLIO_SYNC_TARGETS_JSON?.trim();
  if (!raw) {
    return [];
  }

  const parsed = parseTargetsJson(raw, "PORTFOLIO_SYNC_TARGETS_JSON");

  return parsed.map((item, index) => {
    const target = normalizeRawPortfolioTarget(item);
    const provider = normalizeProvider(target.provider);
    if (!provider) {
      throw new Error(`Источник #${index + 1}: неизвестный provider.`);
    }

    const datasetUrl = normalizeOptional(target.datasetUrl);
    const datasetUrlTemplate = normalizeOptional(target.datasetUrlTemplate);
    if (!normalizeOptional(target.hotelId) && !normalizeOptional(target.hotelName)) {
      throw new Error(
        `Источник #${index + 1}: укажите hotelId или hotelName для сопоставления отеля.`
      );
    }

    return {
      hotelId: normalizeOptional(target.hotelId),
      hotelName: normalizeOptional(target.hotelName),
      provider,
      datasetUrl,
      datasetUrlTemplate,
      query: normalizeOptional(target.query),
      language: normalizeOptional(target.language) || "ru",
      limit: normalizeLimit(target.limit),
      enabled: target.enabled !== false
    };
  });
}

function readFallbackTargets(): FallbackTarget[] {
  const raw = process.env.DEFAULT_REALTIME_TARGETS_JSON?.trim();
  if (!raw) {
    return [];
  }

  const parsed = parseTargetsJson(raw, "DEFAULT_REALTIME_TARGETS_JSON");

  return parsed.map((item, index) => {
    const target = normalizeRawFallbackTarget(item);
    const provider = normalizeProvider(target.provider);
    if (!provider) {
      throw new Error(`Fallback-источник #${index + 1}: неизвестный provider.`);
    }

    const datasetUrl = normalizeOptional(target.datasetUrl);
    const datasetUrlTemplate = normalizeOptional(target.datasetUrlTemplate);
    return {
      provider,
      datasetUrl,
      datasetUrlTemplate,
      query: normalizeOptional(target.query),
      language: normalizeOptional(target.language) || "ru",
      limit: normalizeLimit(target.limit),
      enabled: target.enabled !== false
    };
  });
}

function parseTargetsJson(raw: string, envName: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${envName} содержит некорректный JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${envName} должен быть массивом JSON-объектов.`);
  }

  return parsed;
}

function resolveTargetHotelId(target: Pick<PortfolioTarget, "hotelId" | "hotelName">): string | null {
  const repository = getRepository();
  const hotels = repository.listHotels();

  if (target.hotelId) {
    const byId = repository.getHotelById(target.hotelId);
    if (byId) {
      return byId.id;
    }

    const byExternalId = hotels.find((hotel) => hotel.externalId === target.hotelId);
    if (byExternalId) {
      return byExternalId.id;
    }
  }

  if (target.hotelName) {
    const normalized = target.hotelName.toLocaleLowerCase("ru-RU").trim();
    const byName = hotels.find((hotel) => hotel.name.toLocaleLowerCase("ru-RU").trim() === normalized);
    if (byName) {
      return byName.id;
    }
  }

  return null;
}

function normalizeRawPortfolioTarget(item: unknown): RawPortfolioTarget {
  if (!item || typeof item !== "object") {
    return {};
  }
  return item as RawPortfolioTarget;
}

function normalizeRawFallbackTarget(item: unknown): RawFallbackTarget {
  if (!item || typeof item !== "object") {
    return {};
  }
  return item as RawFallbackTarget;
}

function normalizeOptional(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function normalizeLimit(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(10, Math.min(5000, Math.floor(value)));
}

function normalizeProvider(value?: string): PlatformProvider | null {
  if (!value) {
    return null;
  }
  return PROVIDERS.has(value as PlatformProvider) ? (value as PlatformProvider) : null;
}
