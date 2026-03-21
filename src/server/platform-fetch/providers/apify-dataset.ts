import { IngestionRawRow, PlatformProvider, ReviewSource } from "@/entities/types";
import { decodeEscapedUnicode, normalizeWhitespace } from "@/shared/lib/text";
import { PlatformFetchRequest, PlatformFetchResult } from "@/server/platform-fetch/types";

type JsonObject = Record<string, unknown>;

interface ProviderProfile {
  provider: PlatformProvider;
  label: string;
  fallbackSource: ReviewSource;
}

const PROVIDER_PROFILES: Record<PlatformProvider, ProviderProfile> = {
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
    label: "Российские тревел-агрегаторы",
    fallbackSource: "manual_upload"
  },
  apify_dataset: {
    provider: "apify_dataset",
    label: "Dataset connector",
    fallbackSource: "manual_upload"
  }
};

const APIFY_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_ACTOR_TIMEOUT_MS = 8 * 60 * 1000;

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

export function canFetchWithoutDatasetUrl(provider: PlatformProvider): boolean {
  return !!getApifyToken() && !!resolveActorId(provider);
}

async function fetchFromDatasetByProfile(
  request: PlatformFetchRequest,
  profile: ProviderProfile
): Promise<PlatformFetchResult> {
  const limit = clampLimit(request.limit ?? 250, 10, 5000);
  const searchNeedle = buildSearchNeedle(request);

  const datasetUrl = request.datasetUrl?.trim() || request.apifyDatasetUrl?.trim();
  if (datasetUrl) {
    const rows = await fetchRowsFromDatasetUrl(datasetUrl, request, profile, limit, searchNeedle);
    return {
      provider: profile.provider,
      rows,
      notes: [
        `${profile.label}: загружено ${rows.length} отзывов из dataset URL.`,
        searchNeedle
          ? `Применен фильтр по отелю: ${searchNeedle}.`
          : "Данные загружены без дополнительного фильтра по названию отеля.",
        "Включены пагинация, дедупликация и explainable-аналитика."
      ]
    };
  }

  const actorRows = await fetchRowsFromApifyActor(request, profile, limit, searchNeedle);
  return {
    provider: profile.provider,
    rows: actorRows,
    notes: [
      `${profile.label}: загружено ${actorRows.length} отзывов через Apify actor.`,
      searchNeedle
        ? `Запрос к провайдеру: ${searchNeedle}.`
        : "Запрос к провайдеру выполнен без явного фильтра по отелю.",
      "Включены дедупликация и explainable-аналитика."
    ]
  };
}

async function fetchRowsFromDatasetUrl(
  datasetUrl: string,
  request: PlatformFetchRequest,
  profile: ProviderProfile,
  limit: number,
  searchNeedle: string | null
): Promise<IngestionRawRow[]> {
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

  return rows.slice(0, limit);
}

async function fetchRowsFromApifyActor(
  request: PlatformFetchRequest,
  profile: ProviderProfile,
  limit: number,
  searchNeedle: string | null
): Promise<IngestionRawRow[]> {
  const token = getApifyToken();
  const actorId = resolveActorId(profile.provider);

  if (!token || !actorId) {
    throw new Error(
      `Для провайдера ${profile.provider} не задан datasetUrl и не настроен Apify actor. ` +
        "Укажите datasetUrl/datasetUrlTemplate либо APIFY_TOKEN + APIFY_ACTOR_*."
    );
  }

  const endpoint = new URL(`${APIFY_BASE_URL}/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`);
  endpoint.searchParams.set("token", token);
  endpoint.searchParams.set("clean", "true");
  endpoint.searchParams.set("format", "json");

  const actorInput = buildActorInput(request, profile.provider, limit);
  const timeoutMs = resolveActorTimeoutMs();

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(actorInput),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Apify actor ${actorId} вернул HTTP ${response.status}. ${body.slice(0, 280)}`.trim()
    );
  }

  const payload = (await response.json()) as unknown;
  const items = normalizePayloadItems(payload);

  const mapped = items
    .map((item, index) =>
      mapDatasetItem(
        item,
        index,
        request.language?.trim() || "ru",
        profile.fallbackSource
      )
    )
    .filter((row): row is IngestionRawRow => !!row.text && row.text.length > 3);

  const filtered = searchNeedle
    ? mapped.filter((row) => rowMatchesNeedle(row, searchNeedle))
    : mapped;

  return filtered.slice(0, limit);
}

function buildActorInput(
  request: PlatformFetchRequest,
  provider: PlatformProvider,
  limit: number
): Record<string, unknown> {
  const query = (request.query || `${request.hotel.name} ${request.hotel.city}` || "").trim();
  const template = parseActorInputTemplate(provider);

  if (template) {
    const interpolated = interpolateTemplate(template, {
      provider,
      query,
      queryEncoded: encodeURIComponent(query),
      hotelId: request.hotel.id,
      hotelName: request.hotel.name,
      city: request.hotel.city,
      country: request.hotel.country,
      language: request.language?.trim() || "ru",
      limit: String(limit)
    });
    if (interpolated && typeof interpolated === "object" && !Array.isArray(interpolated)) {
      return interpolated as Record<string, unknown>;
    }
    throw new Error("Шаблон APIFY_ACTOR_INPUT_TEMPLATE_* должен быть JSON-объектом.");
  }

  return {
    query,
    searchString: query,
    searchStringsArray: [query],
    maxItems: limit,
    maxReviews: limit,
    language: request.language?.trim() || "ru"
  };
}

function parseActorInputTemplate(provider: PlatformProvider): JsonObject | null {
  const envName = resolveActorInputTemplateEnv(provider);
  const raw = process.env[envName]?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as JsonObject) : null;
  } catch {
    throw new Error(`${envName} содержит некорректный JSON.`);
  }
}

function interpolateTemplate(
  node: unknown,
  vars: Record<string, string>
): unknown {
  if (typeof node === "string") {
    return Object.entries(vars).reduce(
      (acc, [key, value]) => acc.replaceAll(`{${key}}`, value),
      node
    );
  }
  if (Array.isArray(node)) {
    return node.map((item) => interpolateTemplate(item, vars));
  }
  if (node && typeof node === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(node as JsonObject).forEach(([key, value]) => {
      output[key] = interpolateTemplate(value, vars);
    });
    return output;
  }
  return node;
}

function getApifyToken(): string {
  return (process.env.APIFY_TOKEN || "").trim();
}

function resolveActorId(provider: PlatformProvider): string {
  const byProvider: Record<PlatformProvider, string> = {
    yandex_maps_dataset: (process.env.APIFY_ACTOR_YANDEX_MAPS || "").trim(),
    two_gis_dataset: (process.env.APIFY_ACTOR_TWO_GIS || "").trim(),
    ostrovok_dataset: (process.env.APIFY_ACTOR_OSTROVOK || "").trim(),
    russian_travel_dataset: (process.env.APIFY_ACTOR_RUSSIAN_TRAVEL || "").trim(),
    apify_dataset: (process.env.APIFY_ACTOR_DEFAULT || "").trim()
  };

  if (byProvider[provider]) {
    return byProvider[provider];
  }

  return (process.env.APIFY_ACTOR_DEFAULT || "").trim();
}

function resolveActorInputTemplateEnv(provider: PlatformProvider): string {
  switch (provider) {
    case "yandex_maps_dataset":
      return "APIFY_ACTOR_INPUT_TEMPLATE_YANDEX_MAPS";
    case "two_gis_dataset":
      return "APIFY_ACTOR_INPUT_TEMPLATE_TWO_GIS";
    case "ostrovok_dataset":
      return "APIFY_ACTOR_INPUT_TEMPLATE_OSTROVOK";
    case "russian_travel_dataset":
      return "APIFY_ACTOR_INPUT_TEMPLATE_RUSSIAN_TRAVEL";
    case "apify_dataset":
    default:
      return "APIFY_ACTOR_INPUT_TEMPLATE_DEFAULT";
  }
}

function resolveActorTimeoutMs(): number {
  const parsed = Number(process.env.APIFY_ACTOR_TIMEOUT_MS || "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ACTOR_TIMEOUT_MS;
  }
  return Math.max(30_000, Math.floor(parsed));
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
    cleanText(toString(review.text)) ||
    cleanText(toString(object.text)) ||
    cleanText(toString(object.content)) ||
    cleanText(toString(object.reviewText)) ||
    cleanText(toString(object.body)) ||
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
      cleanText(toString(object.id)) ||
      cleanText(toString(review.reviewId)) ||
      cleanText(toString(object.reviewId)) ||
      cleanText(toString(meta.reviewUid)) ||
      `${source}-${index}`,
    reviewDate: normalizeDate(dateRaw),
    rating: clampNumber(normalizedRating, 0, 10),
    title: cleanText(toString(object.title)) || cleanText(toString(review.title)) || cleanText(toString(meta.hotelName)),
    text,
    language:
      cleanText(toString(review.language)) ||
      cleanText(toString(object.language)) ||
      cleanText(toString(meta.language)) ||
      defaultLanguage,
    authorName:
      cleanText(toString(review.name)) ||
      cleanText(toString(review.authorName)) ||
      cleanText(toString(author.name)) ||
      cleanText(toString(object.userName)) ||
      cleanText(toString(object.author)),
    stayTypeRaw:
      cleanText(toString(object.tripType)) ||
      cleanText(toString(object.stayType)) ||
      cleanText(toString(meta.segmentHint))
  };
}

function detectSource(object: JsonObject, fallback: ReviewSource): ReviewSource {
  const raw = [
    cleanText(toString(object.source)),
    cleanText(toString(object.platform)),
    cleanText(toString(object.site)),
    cleanText(toString(object.origin))
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function cleanText(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const decoded = normalizeWhitespace(decodeEscapedUnicode(value));
  return decoded || undefined;
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
