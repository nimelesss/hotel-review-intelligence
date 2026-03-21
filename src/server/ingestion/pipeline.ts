import {
  IngestionImportRequest,
  IngestionPreviewResult,
  Review
} from "@/entities/types";
import { parseCsvPayload } from "@/server/ingestion/parse-csv";
import { normalizeRows } from "@/server/ingestion/normalize";
import { validateRows } from "@/server/ingestion/validate";

export function buildIngestionPreview(
  request: IngestionImportRequest,
  existingReviews: Review[]
): IngestionPreviewResult {
  const prepared = prepareRows(request, existingReviews);

  return {
    totalRows: prepared.totalRows,
    validRows: prepared.normalized.length,
    duplicates: prepared.duplicates,
    issues: prepared.issues.slice(0, 100),
    normalizedPreview: prepared.normalized.slice(0, 30)
  };
}

export function normalizeForImport(
  request: IngestionImportRequest,
  existingReviews: Review[]
): {
  reviews: Review[];
  preview: IngestionPreviewResult;
} {
  const prepared = prepareRows(request, existingReviews);
  const preview = {
    totalRows: prepared.totalRows,
    validRows: prepared.normalized.length,
    duplicates: prepared.duplicates,
    issues: prepared.issues.slice(0, 100),
    normalizedPreview: prepared.normalized.slice(0, 30)
  };
  return {
    reviews: prepared.normalized,
    preview
  };
}

function parseJsonPayload(payload: string) {
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed;
}

function prepareRows(request: IngestionImportRequest, existingReviews: Review[]) {
  const parsedRows =
    request.fileType === "csv"
      ? parseCsvPayload(request.payload)
      : parseJsonPayload(request.payload);
  const validation = validateRows(parsedRows);
  const normalized = normalizeRows(
    request.hotelId,
    validation.validRows,
    existingReviews
  );

  return {
    totalRows: parsedRows.length,
    normalized: normalized.normalized,
    duplicates: normalized.duplicates,
    issues: validation.issues
  };
}
