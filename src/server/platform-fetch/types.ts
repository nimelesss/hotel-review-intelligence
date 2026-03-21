import { Hotel, IngestionRawRow, PlatformProvider } from "@/entities/types";

export interface PlatformFetchRequest {
  provider: PlatformProvider;
  hotel: Hotel;
  query?: string;
  language?: string;
  limit?: number;
  apifyDatasetUrl?: string;
}

export interface PlatformFetchResult {
  provider: PlatformProvider;
  rows: IngestionRawRow[];
  notes: string[];
}
