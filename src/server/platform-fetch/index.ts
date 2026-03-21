import { PlatformFetchResult, PlatformFetchRequest } from "@/server/platform-fetch/types";
import { fetchFromGooglePlaces } from "@/server/platform-fetch/providers/google-places";
import { fetchFromApifyDataset } from "@/server/platform-fetch/providers/apify-dataset";

export async function fetchPlatformReviews(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  if (request.provider === "google_places") {
    return fetchFromGooglePlaces(request);
  }
  if (request.provider === "apify_dataset") {
    return fetchFromApifyDataset(request);
  }
  throw new Error(`Unsupported provider: ${request.provider}`);
}
