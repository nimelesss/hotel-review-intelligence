import {
  AnalysisRun,
  PlatformIngestionRequest,
  PlatformProvider
} from "@/entities/types";
import { getRepository } from "@/server/repositories";
import {
  startPlatformIngestionRun
} from "@/server/services/intelligence.service";

type SyncMode = "manual" | "weekly";

interface RawPortfolioTarget {
  hotelId?: string;
  hotelName?: string;
  provider?: string;
  datasetUrl?: string;
  query?: string;
  language?: string;
  limit?: number;
  enabled?: boolean;
}

interface PortfolioTarget {
  hotelId?: string;
  hotelName?: string;
  provider: PlatformProvider;
  datasetUrl: string;
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
  "russian_travel_dataset",
  "apify_dataset"
]);

export function getPortfolioSyncReadiness(): PortfolioSyncReadiness {
  const repository = getRepository();
  const hotels = repository.listHotels();
  const targets = readPortfolioTargets();

  const resolvedHotelIds = new Set<string>();
  const providers = new Set<PlatformProvider>();

  targets.forEach((target) => {
    if (!target.enabled) {
      return;
    }
    const hotelId = resolveTargetHotelId(target);
    if (!hotelId) {
      return;
    }
    resolvedHotelIds.add(hotelId);
    providers.add(target.provider);
  });

  const hotelsWithoutTargets = hotels
    .filter((hotel) => !resolvedHotelIds.has(hotel.id))
    .map((hotel) => hotel.name);

  return {
    targetsTotal: targets.filter((target) => target.enabled).length,
    hotelsInSystem: hotels.length,
    hotelsCovered: resolvedHotelIds.size,
    providers: [...providers],
    hotelsWithoutTargets
  };
}

export function startPortfolioSync(mode: SyncMode, hotelIds?: string[]): PortfolioSyncResult {
  const repository = getRepository();
  const targets = readPortfolioTargets();
  if (!targets.length) {
    throw new Error(
      "PORTFOLIO_SYNC_TARGETS_JSON is empty. Configure sync targets before running portfolio sync."
    );
  }

  const filterSet = hotelIds?.length
    ? new Set(
        hotelIds.filter((id) => {
          const candidate = id.trim();
          return !!candidate && !!repository.getHotelById(candidate);
        })
      )
    : null;
  if (hotelIds?.length && filterSet && filterSet.size === 0) {
    throw new Error("None of provided hotelIds exist in system.");
  }
  const warnings: string[] = [];
  const runs: AnalysisRun[] = [];
  const coveredHotels = new Set<string>();

  targets.forEach((target) => {
    if (!target.enabled) {
      return;
    }

    const hotelId = resolveTargetHotelId(target);
    if (!hotelId) {
      warnings.push(
        `Target skipped: cannot resolve hotel "${target.hotelId || target.hotelName || "unknown"}".`
      );
      return;
    }
    if (filterSet && !filterSet.has(hotelId)) {
      return;
    }

    try {
      const request: PlatformIngestionRequest = {
        hotelId,
        provider: target.provider,
        datasetUrl: target.datasetUrl,
        query: target.query,
        language: target.language,
        limit: target.limit
      };
      const run = startPlatformIngestionRun(request);
      runs.push(run);
      coveredHotels.add(hotelId);
    } catch (error) {
      warnings.push(
        `Target failed for hotel "${target.hotelId || target.hotelName || hotelId}": ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );
    }
  });

  return {
    mode,
    startedAt: new Date().toISOString(),
    targetsTotal: filterSet
      ? targets.filter(
          (target) =>
            target.enabled &&
            resolveTargetHotelId(target) &&
            filterSet.has(resolveTargetHotelId(target) as string)
        ).length
      : targets.filter((target) => target.enabled).length,
    targetsStarted: runs.length,
    hotelsCovered: coveredHotels.size,
    runs,
    warnings
  };
}

export function startRealtimeSyncForHotel(hotelIdRaw: string): PortfolioSyncResult {
  const repository = getRepository();
  const hotelId = hotelIdRaw.trim();
  if (!hotelId || !repository.getHotelById(hotelId)) {
    throw new Error("hotelId is invalid or does not exist.");
  }

  const targets = readPortfolioTargets().filter((target) => target.enabled);
  const matchingHotelTargets = targets.filter(
    (target) => resolveTargetHotelId(target) === hotelId
  );

  if (!matchingHotelTargets.length) {
    throw new Error(
      "No configured sources for this hotel. Add target records in PORTFOLIO_SYNC_TARGETS_JSON."
    );
  }

  return startPortfolioSync("manual", [hotelId]);
}

function readPortfolioTargets(): PortfolioTarget[] {
  const raw = process.env.PORTFOLIO_SYNC_TARGETS_JSON?.trim();
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("PORTFOLIO_SYNC_TARGETS_JSON has invalid JSON format.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("PORTFOLIO_SYNC_TARGETS_JSON must be a JSON array.");
  }

  const normalized: PortfolioTarget[] = [];
  parsed.forEach((item, index) => {
    const candidate = normalizeRawTarget(item);
    const provider = normalizeProvider(candidate.provider);
    if (!provider) {
      throw new Error(`Sync target #${index + 1}: provider is missing or unsupported.`);
    }
    if (!candidate.datasetUrl || !candidate.datasetUrl.startsWith("http")) {
      throw new Error(`Sync target #${index + 1}: datasetUrl must be an absolute http(s) URL.`);
    }
    if (!candidate.hotelId && !candidate.hotelName) {
      throw new Error(
        `Sync target #${index + 1}: provide hotelId or hotelName to map target to hotel.`
      );
    }

    normalized.push({
      hotelId: normalizeOptional(candidate.hotelId),
      hotelName: normalizeOptional(candidate.hotelName),
      provider,
      datasetUrl: candidate.datasetUrl.trim(),
      query: normalizeOptional(candidate.query),
      language: normalizeOptional(candidate.language) || "ru",
      limit: normalizeLimit(candidate.limit),
      enabled: candidate.enabled !== false
    });
  });

  return normalized;
}

function resolveTargetHotelId(target: PortfolioTarget): string | null {
  const repository = getRepository();

  if (target.hotelId) {
    return repository.getHotelById(target.hotelId)?.id ?? null;
  }

  if (!target.hotelName) {
    return null;
  }

  const normalized = target.hotelName.toLocaleLowerCase("ru-RU");
  const match = repository.listHotels().find(
    (hotel) => hotel.name.toLocaleLowerCase("ru-RU") === normalized
  );
  return match?.id ?? null;
}

function normalizeRawTarget(item: unknown): RawPortfolioTarget {
  if (!item || typeof item !== "object") {
    return {};
  }
  return item as RawPortfolioTarget;
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
