import { ReviewSource } from "@/entities/types";

export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = {
  yandex: "Яндекс Карты",
  "2gis": "2ГИС",
  flamp: "Flamp",
  ostrovok: "Островок",
  "booking.com": "Booking.com",
  otzovik: "Отзовик",
  yell: "Yell",
  sutochno: "Суточно.ру",
  bronevik: "Bronevik",
  tripadvisor: "Tripadvisor",
  manual_upload: "Ручной импорт",
  mock_api: "Тестовый источник",
  apify_dataset: "Dataset-источник"
};

export const REVIEW_SOURCE_PRIORITY: ReviewSource[] = [
  "yandex",
  "2gis",
  "ostrovok",
  "flamp",
  "sutochno",
  "bronevik",
  "otzovik",
  "yell",
  "booking.com",
  "tripadvisor",
  "manual_upload",
  "mock_api",
  "apify_dataset"
];
