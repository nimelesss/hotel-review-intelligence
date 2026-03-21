import { PlatformFetchResult, PlatformFetchRequest } from "@/server/platform-fetch/types";
import {
  fetchFromApifyDataset,
  fetchFromOstrovokDataset,
  fetchFromRussianTravelDataset,
  fetchFromTwoGisDataset,
  fetchFromYandexMapsDataset
} from "@/server/platform-fetch/providers/apify-dataset";

export async function fetchPlatformReviews(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  if (request.provider === "yandex_maps_dataset") {
    return fetchFromYandexMapsDataset(request);
  }
  if (request.provider === "two_gis_dataset") {
    return fetchFromTwoGisDataset(request);
  }
  if (request.provider === "russian_travel_dataset") {
    return fetchFromRussianTravelDataset(request);
  }
  if (request.provider === "ostrovok_dataset") {
    return fetchFromOstrovokDataset(request);
  }
  if (request.provider === "apify_dataset") {
    return fetchFromApifyDataset(request);
  }
  throw new Error(`Unsupported provider: ${request.provider}`);
}
