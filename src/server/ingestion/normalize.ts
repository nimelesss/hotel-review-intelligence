import {
  IngestionRawRow,
  IngestionValidationIssue,
  Review,
  ReviewSource
} from "@/entities/types";
import { createId } from "@/shared/lib/id";
import { normalizeWhitespace } from "@/shared/lib/text";
import { preprocessReviewText } from "@/server/analytics/preprocess";

export interface NormalizeResult {
  normalized: Review[];
  duplicates: number;
}

export function normalizeRows(
  hotelId: string,
  rows: IngestionRawRow[],
  existingReviews: Review[]
): NormalizeResult {
  const existingKeys = new Set(existingReviews.map(buildDedupeKey));
  const normalized: Review[] = [];
  let duplicates = 0;

  rows.forEach((row) => {
    const rawText = row.text?.trim() ?? "";
    const preprocessed = preprocessReviewText(rawText);
    const source = normalizeSource(row.source);
    const reviewDate = row.reviewDate
      ? new Date(row.reviewDate).toISOString()
      : new Date().toISOString();
    const rating = Number(row.rating ?? 0);

    const draft: Review = {
      id: createId("review"),
      hotelId,
      source,
      sourceReviewId: normalizeOptional(row.sourceReviewId),
      reviewDate,
      rating,
      title: normalizeOptional(row.title),
      text: rawText,
      cleanedText: preprocessed.cleanedText,
      language: row.language?.trim() || "ru",
      authorName: normalizeOptional(row.authorName),
      stayTypeRaw: normalizeOptional(row.stayTypeRaw),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const dedupeKey = buildDedupeKey(draft);
    if (existingKeys.has(dedupeKey)) {
      duplicates += 1;
      return;
    }

    existingKeys.add(dedupeKey);
    normalized.push(draft);
  });

  return {
    normalized,
    duplicates
  };
}

export function buildDedupeKey(review: Review): string {
  const sourceId = review.sourceReviewId
    ? `${review.source}:${review.sourceReviewId}`
    : `${review.source}:${normalizeWhitespace(
        review.text.slice(0, 80).toLocaleLowerCase("ru-RU")
      )}:${review.reviewDate.slice(0, 10)}:${review.rating}`;
  return `${review.hotelId}:${sourceId}`;
}

function normalizeSource(value?: string): ReviewSource {
  const source = (value ?? "").trim();
  const known: ReviewSource[] = [
    "booking.com",
    "google",
    "ostrovok",
    "tripadvisor",
    "yandex",
    "manual_upload",
    "mock_api",
    "google_places",
    "apify_dataset"
  ];
  return known.includes(source as ReviewSource)
    ? (source as ReviewSource)
    : "manual_upload";
}

function normalizeOptional(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
}

export function mergeIssues(
  primary: IngestionValidationIssue[],
  secondary: IngestionValidationIssue[]
): IngestionValidationIssue[] {
  return [...primary, ...secondary];
}
