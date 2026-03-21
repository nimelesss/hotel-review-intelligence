import { IngestionRawRow } from "@/entities/types";
import { PlatformFetchRequest, PlatformFetchResult } from "@/server/platform-fetch/types";

interface GooglePlaceCandidateResponse {
  status: string;
  candidates?: Array<{
    place_id: string;
    name?: string;
    formatted_address?: string;
  }>;
  error_message?: string;
}

interface GooglePlaceDetailsResponse {
  status: string;
  result?: {
    name?: string;
    rating?: number;
    reviews?: Array<{
      author_name?: string;
      text?: string;
      rating?: number;
      relative_time_description?: string;
      time?: number;
      language?: string;
    }>;
  };
  error_message?: string;
}

export async function fetchFromGooglePlaces(
  request: PlatformFetchRequest
): Promise<PlatformFetchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is missing on server. Set it to enable real Google reviews ingestion."
    );
  }

  const textQuery = request.query?.trim() || `${request.hotel.name} ${request.hotel.city}`;
  const lang = request.language?.trim() || "ru";
  const maxLimit = clampLimit(request.limit ?? 50, 1, 100);

  const findUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
  );
  findUrl.searchParams.set("input", textQuery);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id,name,formatted_address");
  findUrl.searchParams.set("language", lang);
  findUrl.searchParams.set("key", apiKey);

  const findResponse = await fetch(findUrl.toString(), { cache: "no-store" });
  if (!findResponse.ok) {
    throw new Error(`Google Places lookup failed: HTTP ${findResponse.status}`);
  }
  const findPayload = (await findResponse.json()) as GooglePlaceCandidateResponse;
  if (!findPayload.candidates?.length) {
    throw new Error(
      `Google Places did not return a matching place for "${textQuery}". ${
        findPayload.error_message ?? ""
      }`.trim()
    );
  }
  if (findPayload.status !== "OK" && findPayload.status !== "ZERO_RESULTS") {
    throw new Error(
      `Google Places lookup status: ${findPayload.status}. ${
        findPayload.error_message ?? ""
      }`.trim()
    );
  }

  const candidate = findPayload.candidates[0];
  const detailsUrl = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json"
  );
  detailsUrl.searchParams.set("place_id", candidate.place_id);
  detailsUrl.searchParams.set(
    "fields",
    "name,rating,reviews,user_ratings_total,formatted_address"
  );
  detailsUrl.searchParams.set("language", lang);
  detailsUrl.searchParams.set("reviews_sort", "newest");
  detailsUrl.searchParams.set("key", apiKey);

  const detailsResponse = await fetch(detailsUrl.toString(), { cache: "no-store" });
  if (!detailsResponse.ok) {
    throw new Error(`Google Place details failed: HTTP ${detailsResponse.status}`);
  }
  const detailsPayload = (await detailsResponse.json()) as GooglePlaceDetailsResponse;
  if (detailsPayload.status !== "OK") {
    throw new Error(
      `Google Place details status: ${detailsPayload.status}. ${
        detailsPayload.error_message ?? ""
      }`.trim()
    );
  }

  const reviews = detailsPayload.result?.reviews ?? [];
  const sliced = reviews.slice(0, maxLimit);
  const rows: IngestionRawRow[] = sliced.map((review, index) => ({
    source: "google_places",
    sourceReviewId: `${candidate.place_id}-${index}`,
    reviewDate: review.time
      ? new Date(review.time * 1000).toISOString()
      : new Date().toISOString(),
    rating: review.rating ? Number(review.rating) * 2 : detailsPayload.result?.rating ?? 7,
    title: candidate.name,
    text: review.text ?? "",
    language: review.language || lang,
    authorName: review.author_name,
    stayTypeRaw: undefined
  }));

  return {
    provider: "google_places",
    rows,
    notes: [
      `Matched place: ${candidate.name ?? textQuery}.`,
      `Google Places API returns limited review volume per place; fetched ${rows.length} review(s).`
    ]
  };
}

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
