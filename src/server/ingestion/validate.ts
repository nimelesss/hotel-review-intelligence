import {
  IngestionRawRow,
  IngestionValidationIssue,
  ReviewSource
} from "@/entities/types";

const SOURCES: ReviewSource[] = [
  "booking.com",
  "yandex",
  "2gis",
  "flamp",
  "ostrovok",
  "otzovik",
  "yell",
  "sutochno",
  "bronevik",
  "tripadvisor",
  "manual_upload",
  "mock_api",
  "apify_dataset"
];

export interface ValidationResult {
  validRows: IngestionRawRow[];
  issues: IngestionValidationIssue[];
}

export function validateRows(rows: IngestionRawRow[]): ValidationResult {
  const issues: IngestionValidationIssue[] = [];
  const validRows: IngestionRawRow[] = [];

  rows.forEach((row, rowIndex) => {
    const rowNo = rowIndex + 2;
    const rowIssues: IngestionValidationIssue[] = [];

    if (!row.text || row.text.trim().length < 5) {
      rowIssues.push({
        row: rowNo,
        field: "text",
        message: "Review text is required and must be at least 5 characters."
      });
    }

    const rating = Number(row.rating);
    if (Number.isNaN(rating) || rating < 0 || rating > 10) {
      rowIssues.push({
        row: rowNo,
        field: "rating",
        message: "Rating is required and must be in range 0..10."
      });
    }

    if (row.source && !SOURCES.includes(row.source as ReviewSource)) {
      rowIssues.push({
        row: rowNo,
        field: "source",
        message: "Source is not supported by ingestion schema."
      });
    }

    if (row.reviewDate && Number.isNaN(new Date(row.reviewDate).getTime())) {
      rowIssues.push({
        row: rowNo,
        field: "reviewDate",
        message: "Invalid reviewDate format."
      });
    }

    if (rowIssues.length) {
      issues.push(...rowIssues);
      return;
    }

    validRows.push(row);
  });

  return {
    validRows,
    issues
  };
}
