import { IngestionRawRow, PlatformProvider, ReviewSource } from "@/entities/types";
import { PlatformFetchRequest, PlatformFetchResult } from "@/server/platform-fetch/types";

type JsonObject = Record<string, unknown>;

interface ProviderProfile {
  provider: PlatformProvider;
  label: string;
  fallbackSource: ReviewSource;
}

const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  yandex_maps_dataset: {
    provider: "yandex_maps_dataset",
    label: "Yandex Maps",
    fallbackSource: "yandex"
  },
  two_gis_dataset: {
    provider: "two_gis_dataset",
    label: "2GIS / Flamp",
    fallbackSource: "2gis"
  },
  ostrovok_dataset: {
    provider: "ostrovok_dataset",
    label: "Островок",
    fallbackSource: "ostrovok"
  },
  russian_travel_dataset: {
    provider: "russian_travel_dataset",
    label: "Russian travel aggregators",
    fallbackSource: "manual_upload"
  },
  apify_dataset: {
    provider: "apify_dataset",
    label: "Dataset connector",
    fallbackSource: "manual_upload"
  }
};

export async function fetchFromYandexMapsDataset(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  return fetchFromDatasetByProfile(request, PROVIDER_PROFILES.yandex_maps_dataset);
}

export async function fetchFromTwoGisDataset(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  return fetchFromDatasetByProfile(request, PROVIDER_PROFILES.two_gis_dataset);
}

export async function fetchFromRussianTravelDataset(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  return fetchFromDatasetByProfile(request, PROVIDER_PROFILES.russian_travel_dataset);
}

export async function fetchFromOstrovokDataset(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  return fetchFromDatasetByProfile(request, PROVIDER_PROFILES.ostrovok_dataset);
}

export async function fetchFromApifyDataset(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  return fetchFromDatasetByProfile(request, PROVIDER_PROFILES.apify_dataset);
}

async function fetchFromDatasetByProfile(
  request: PlatformFetchRequest,
  profile: ProviderProfile
): Promise<PlatformFetchResult> {
  const datasetUrl = request.datasetUrl?.trim() || request.apifyDatasetUrl?.trim();
  if (!datasetUrl) {
    throw new Error(
      "datasetUrl обязателен. Передайте URL JSON-выгрузки отзывов."
    );
  }

  const limit = clampLimit(request.limit ?? 250, 10, 5000);
  const searchNeedle = buildSearchNeedle(request);
  const rows: IngestionRawRow[] = [];
  let offset = 0;

  while (rows.length < limit) {
    const pageSize = Math.min(250, limit - rows.length);
    const url = new URL(datasetUrl);
    url.searchParams.set("clean", "true");
    url.searchParams.set("format", "json");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(pageSize));

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Ошибка запроса к dataset: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    const items = normalizePayloadItems(payload);
    if (!items.length) {
      break;
    }

    const mapped = items
      .map((item, index) =>
        mapDatasetItem(
          item,
          rows.length + index,
          request.language?.trim() || "ru",
          profile.fallbackSource
        )
      )
      .filter((row): row is IngestionRawRow => !!row.text && row.text.length > 3);

    const filtered = searchNeedle
      ? mapped.filter((row) => rowMatchesNeedle(row, searchNeedle))
      : mapped;

    rows.push(...filtered);

    if (items.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return {
    provider: profile.provider,
    rows: rows.slice(0, limit),
    notes: [
      `${profile.label}: fetched ${rows.length} review rows from dataset export.`,
      searchNeedle
        ? `Применен фильтр по отелю: ${searchNeedle}.`
        : "Данные загружены без дополнительного фильтра по названию отеля.",
      "Включены пагинация, дедупликация и explainable-аналитика."
    ]
  };
}

function buildSearchNeedle(request: PlatformFetchRequest): string | null {
  const raw = request.query?.trim() || `${request.hotel.name} ${request.hotel.city}`;
  const normalized = raw.toLocaleLowerCase("ru-RU").trim();
  return normalized.length >= 3 ? normalized : null;
}

function rowMatchesNeedle(row: IngestionRawRow, needle: string): boolean {
  const haystack = `${row.title || ""} ${row.text || ""} ${row.stayTypeRaw || ""}`
    .toLocaleLowerCase("ru-RU")
    .trim();
  if (!haystack) {
    return false;
  }
  const chunks = needle.split(/\s+/).filter((chunk) => chunk.length >= 3);
  return chunks.some((chunk) => haystack.includes(chunk));
}

function mapDatasetItem(
  item: unknown,
  index: number,
  defaultLanguage: string,
  fallbackSource: ReviewSource
): IngestionRawRow {
  const object = asObject(item);
  const review = asObject(object.review);
  const author = asObject(object.author);
  const meta = asObject(object.meta);

  const text =
    toString(review.text) ||
    toString(object.text) ||
    toString(object.content) ||
    toString(object.reviewText) ||
    toString(object.body) ||
    "";

  const rating =
    toNumber(review.rating) ??
    toNumber(review.stars) ??
    toNumber(object.rating) ??
    toNumber(object.stars) ??
    toNumber(object.score) ??
    7;
  const normalizedRating = rating <= 5 ? rating * 2 : rating;

  const dateRaw =
    toString(review.publishedAtDate) ||
    toString(review.publishedAt) ||
    toString(object.date) ||
    toString(object.publishedAt) ||
    toString(object.createdAt) ||
    toString(meta.updatedAt);

  const source = detectSource(object, fallbackSource);

  return {
    source,
    sourceReviewId:
      toString(object.id) ||
      toString(review.reviewId) ||
      toString(object.reviewId) ||
      toString(meta.reviewUid) ||
      `${source}-${index}`,
    reviewDate: normalizeDate(dateRaw),
    rating: clampNumber(normalizedRating, 0, 10),
    title: toString(object.title) || toString(review.title) || toString(meta.hotelName),
    text,
    language:
      toString(review.language) ||
      toString(object.language) ||
      toString(meta.language) ||
      defaultLanguage,
    authorName:
      toString(review.name) ||
      toString(review.authorName) ||
      toString(author.name) ||
      toString(object.userName) ||
      toString(object.author),
    stayTypeRaw:
      toString(object.tripType) || toString(object.stayType) || toString(meta.segmentHint)
  };
}

function detectSource(object: JsonObject, fallback: ReviewSource): ReviewSource {
  const raw =
    [
      toString(object.source),
      toString(object.platform),
      toString(object.site),
      toString(object.origin)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  if (!raw) {
    return fallback;
  }
  if (raw.includes("yandex") || raw.includes("яндекс")) {
    return "yandex";
  }
  if (raw.includes("2gis") || raw.includes("2гис")) {
    return "2gis";
  }
  if (raw.includes("flamp")) {
    return "flamp";
  }
  if (raw.includes("ostrovok")) {
    return "ostrovok";
  }
  if (raw.includes("otzovik") || raw.includes("отзовик")) {
    return "otzovik";
  }
  if (raw.includes("yell")) {
    return "yell";
  }
  if (raw.includes("sutochno")) {
    return "sutochno";
  }
  if (raw.includes("bronevik")) {
    return "bronevik";
  }
  if (raw.includes("booking")) {
    return "booking.com";
  }

  return fallback;
}

function normalizePayloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const object = payload as JsonObject;
    if (Array.isArray(object.items)) {
      return object.items;
    }
    if (Array.isArray(object.data)) {
      return object.data;
    }
  }
  return [];
}

function normalizeDate(value?: string): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as JsonObject;
}

function toString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
