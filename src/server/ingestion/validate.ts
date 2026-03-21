import {
  IngestionRawRow,
  IngestionValidationIssue,
  ReviewSource
} from "@/entities/types";

const SOURCES: ReviewSource[] = [
  "booking.com",
  "google",
  "ostrovok",
  "tripadvisor",
  "yandex",
  "manual_upload",
  "mock_api"
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
        message: "Текст отзыва обязателен и должен быть длиннее 5 символов."
      });
    }

    const rating = Number(row.rating);
    if (Number.isNaN(rating) || rating < 0 || rating > 10) {
      rowIssues.push({
        row: rowNo,
        field: "rating",
        message: "Рейтинг обязателен и должен быть в диапазоне 0..10."
      });
    }

    if (row.source && !SOURCES.includes(row.source as ReviewSource)) {
      rowIssues.push({
        row: rowNo,
        field: "source",
        message: "Источник не поддерживается в MVP."
      });
    }

    if (row.reviewDate && Number.isNaN(new Date(row.reviewDate).getTime())) {
      rowIssues.push({
        row: rowNo,
        field: "reviewDate",
        message: "Неверный формат даты отзыва."
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
