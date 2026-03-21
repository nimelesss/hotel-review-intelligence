import { IngestionRawRow } from "@/entities/types";
import { PlatformFetchRequest, PlatformFetchResult } from "@/server/platform-fetch/types";

type JsonObject = Record<string, unknown>;

export async function fetchFromApifyDataset(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  const datasetUrl = request.apifyDatasetUrl?.trim();
  if (!datasetUrl) {
    throw new Error(
      "apifyDatasetUrl is required for apify_dataset provider. Use Apify dataset API URL."
    );
  }

  const limit = clampLimit(request.limit ?? 200, 10, 1000);
  const rows: IngestionRawRow[] = [];
  let offset = 0;

  while (rows.length < limit) {
    const pageSize = Math.min(200, limit - rows.length);
    const url = new URL(datasetUrl);
    url.searchParams.set("clean", "true");
    url.searchParams.set("format", "json");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(pageSize));

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Apify dataset request failed: HTTP ${response.status}`);
    }
    const items = (await response.json()) as unknown[];
    if (!Array.isArray(items) || items.length === 0) {
      break;
    }

    const mapped = items
      .map((item, index) =>
        mapApifyItem(
          item,
          rows.length + index,
          request.language?.trim() || "ru"
        )
      )
      .filter((row): row is IngestionRawRow => !!row.text && row.text.length > 3);
    rows.push(...mapped);

    if (items.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return {
    provider: "apify_dataset",
    rows: rows.slice(0, limit),
    notes: [
      `Fetched ${rows.length} review rows from Apify dataset.`,
      "For higher volume, provide dataset with paginated review export from your selected platforms."
    ]
  };
}

function mapApifyItem(
  item: unknown,
  index: number,
  defaultLanguage: string
): IngestionRawRow {
  const object = asObject(item);
  const review = asObject(object.review);

  const text =
    toString(review.text) ||
    toString(object.text) ||
    toString(object.content) ||
    toString(object.reviewText) ||
    "";
  const rating =
    toNumber(review.rating) ??
    toNumber(review.stars) ??
    toNumber(object.rating) ??
    toNumber(object.stars) ??
    7;
  const normalizedRating = rating <= 5 ? rating * 2 : rating;
  const dateRaw =
    toString(review.publishedAtDate) ||
    toString(review.publishedAt) ||
    toString(object.date) ||
    toString(object.publishedAt);

  return {
    source: "apify_dataset",
    sourceReviewId:
      toString(object.id) ||
      toString(review.reviewId) ||
      toString(object.reviewId) ||
      `apify-${index}`,
    reviewDate: normalizeDate(dateRaw),
    rating: normalizedRating,
    title: toString(object.title) || toString(review.title),
    text,
    language:
      toString(review.language) || toString(object.language) || defaultLanguage,
    authorName:
      toString(review.name) ||
      toString(review.authorName) ||
      toString(object.userName) ||
      toString(object.author),
    stayTypeRaw: toString(object.tripType) || toString(object.stayType)
  };
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
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
