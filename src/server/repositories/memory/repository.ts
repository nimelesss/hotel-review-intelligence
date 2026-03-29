import fs from "node:fs";
import path from "node:path";
import {
  AnalysisRun,
  CreateHotelRequest,
  Hotel,
  HotelAggregate,
  HotelExternalProfile,
  Recommendation,
  Review,
  ReviewAnalysis,
  ReviewFetchJob,
  ReviewFetchJobSource,
  ReviewsQuery,
  ReviewsQueryResult
} from "@/entities/types";
import { seedHotels } from "@/data/seeds/hotels";
import { seedReviews } from "@/data/seeds/reviews";
import { runAnalysisForHotel } from "@/server/analytics/run-analysis";
import {
  IntelligenceRepository,
  RepositorySnapshot
} from "@/server/repositories/types";
import { normalizeSearchText, normalizeWhitespace } from "@/shared/lib/text";

interface MemoryState {
  hotels: Hotel[];
  reviews: Review[];
  analyses: ReviewAnalysis[];
  aggregates: HotelAggregate[];
  recommendations: Recommendation[];
  runs: AnalysisRun[];
  externalProfiles: HotelExternalProfile[];
  reviewFetchJobs: ReviewFetchJob[];
  reviewFetchJobSources: ReviewFetchJobSource[];
}

const LEGACY_DEMO_HOTEL_IDS = new Set([
  "hotel-courtyard-rostov",
  "hotel-riverpark-kazan",
  "hotel-test-deploy"
]);
const LEGACY_DEMO_HOTEL_NAMES = new Set([
  "Courtyard by Marriott Rostov-on-Don",
  "Riverpark Hotel Kazan",
  "Test Deploy Hotel"
]);

export class InMemoryIntelligenceRepository implements IntelligenceRepository {
  private state: MemoryState;
  private readonly storePath: string;

  constructor(seed?: Partial<MemoryState>) {
    this.storePath =
      process.env.RUNTIME_STORE_PATH ||
      path.join(process.cwd(), ".runtime-store.json");

    const seededState: MemoryState = {
      hotels: seed?.hotels ?? seedHotels,
      reviews: seed?.reviews ?? seedReviews,
      analyses: seed?.analyses ?? [],
      aggregates: seed?.aggregates ?? [],
      recommendations: seed?.recommendations ?? [],
      runs: seed?.runs ?? [],
      externalProfiles: [],
      reviewFetchJobs: [],
      reviewFetchJobSources: []
    };

    const loaded = this.loadFromDisk();
    this.state = loaded ?? seededState;
    this.removeLegacyDemoHotels();
    this.bootstrapAnalytics();
    this.flushToDisk();
  }

  listHotels(): Hotel[] {
    this.syncFromDisk();
    return [...this.state.hotels];
  }

  createHotel(request: CreateHotelRequest): Hotel {
    this.syncFromDisk();
    const normalizedName = request.name.trim();
    const normalizedCity = request.city.trim();
    if (!normalizedName || !normalizedCity) {
      throw new Error("Название отеля и город обязательны.");
    }

    const normalizedExternalId = request.externalId?.trim();
    if (normalizedExternalId) {
      const byExternalId = this.state.hotels.find(
        (hotel) => hotel.externalId === normalizedExternalId
      );
      if (byExternalId) {
        const merged = mergeHotel(byExternalId, request);
        this.state.hotels = this.state.hotels.map((hotel) =>
          hotel.id === byExternalId.id ? merged : hotel
        );
        this.flushToDisk();
        return merged;
      }
    }

    const requestCanonicalName = canonicalHotelName(normalizedName, normalizedCity);
    const duplicate = this.state.hotels.find(
      (hotel) =>
        sameCity(hotel.city, normalizedCity) &&
        canonicalHotelName(hotel.name, hotel.city) === requestCanonicalName
    );
    if (duplicate) {
      const merged = mergeHotel(duplicate, request);
      this.state.hotels = this.state.hotels.map((hotel) =>
        hotel.id === duplicate.id ? merged : hotel
      );
      this.flushToDisk();
      return merged;
    }

    const now = new Date().toISOString();
    const hotel: Hotel = {
      id: `hotel-${slugify(normalizedName)}-${slugify(normalizedCity)}-${Date.now()
        .toString()
        .slice(-5)}`,
      name: normalizedName,
      city: normalizedCity,
      country: (request.country || "Россия").trim(),
      brand: (request.brand || "Независимый отель").trim(),
      category: (request.category || "4*").trim(),
      address: (request.address || `${normalizedCity}, ${request.country || "Россия"}`).trim(),
      description:
        (request.description ||
          "Профиль создан пользователем. Аналитика появится после загрузки отзывов.").trim(),
      coordinates: request.coordinates,
      externalId: normalizedExternalId,
      createdAt: now,
      updatedAt: now
    };
    this.state.hotels = [hotel, ...this.state.hotels];
    this.flushToDisk();
    return hotel;
  }

  getHotelById(hotelId: string): Hotel | undefined {
    this.syncFromDisk();
    return this.state.hotels.find((hotel) => hotel.id === hotelId);
  }

  listReviewsByHotel(hotelId: string): Review[] {
    this.syncFromDisk();
    return this.state.reviews.filter((review) => review.hotelId === hotelId);
  }

  listAnalysesByHotel(hotelId: string): ReviewAnalysis[] {
    this.syncFromDisk();
    const reviewIds = new Set(
      this.state.reviews
        .filter((review) => review.hotelId === hotelId)
        .map((review) => review.id)
    );
    return this.state.analyses.filter((analysis) => reviewIds.has(analysis.reviewId));
  }

  getAggregateByHotel(hotelId: string): HotelAggregate | undefined {
    this.syncFromDisk();
    return this.state.aggregates.find((aggregate) => aggregate.hotelId === hotelId);
  }

  listRecommendationsByHotel(hotelId: string): Recommendation[] {
    this.syncFromDisk();
    return this.state.recommendations.filter(
      (recommendation) => recommendation.hotelId === hotelId
    );
  }

  listRunsByHotel(hotelId: string): AnalysisRun[] {
    this.syncFromDisk();
    return this.state.runs
      .filter((run) => run.hotelId === hotelId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  queryReviews(query: ReviewsQuery): ReviewsQueryResult {
    this.syncFromDisk();
    const reviews = this.listReviewsByHotel(query.hotelId);
    const analyses = this.listAnalysesByHotel(query.hotelId);
    const analysisMap = new Map(analyses.map((analysis) => [analysis.reviewId, analysis]));

    const filtered = reviews
      .map((review) => ({
        review,
        analysis: analysisMap.get(review.id)
      }))
      .filter((item): item is { review: Review; analysis: ReviewAnalysis } => !!item.analysis)
      .filter((item) => applyReviewFilters(item.review, item.analysis, query));

    return {
      total: filtered.length,
      items: filtered.sort((a, b) => b.review.reviewDate.localeCompare(a.review.reviewDate))
    };
  }

  createRun(run: AnalysisRun): void {
    this.syncFromDisk();
    this.state.runs = [run, ...this.state.runs.filter((item) => item.id !== run.id)];
    this.flushToDisk();
  }

  updateRun(runId: string, patch: Partial<AnalysisRun>): AnalysisRun | undefined {
    this.syncFromDisk();
    const index = this.state.runs.findIndex((run) => run.id === runId);
    if (index === -1) {
      return undefined;
    }
    const updated: AnalysisRun = {
      ...this.state.runs[index],
      ...patch
    };
    this.state.runs[index] = updated;
    this.flushToDisk();
    return updated;
  }

  getRunById(runId: string): AnalysisRun | undefined {
    this.syncFromDisk();
    return this.state.runs.find((run) => run.id === runId);
  }

  listExternalProfilesByHotel(hotelId: string): HotelExternalProfile[] {
    this.syncFromDisk();
    return this.state.externalProfiles
      .filter((profile) => profile.hotelId === hotelId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  upsertExternalProfile(profile: HotelExternalProfile): void {
    this.syncFromDisk();
    const existingIndex = this.state.externalProfiles.findIndex(
      (item) => item.hotelId === profile.hotelId && item.source === profile.source
    );
    if (existingIndex === -1) {
      this.state.externalProfiles = [profile, ...this.state.externalProfiles];
    } else {
      this.state.externalProfiles[existingIndex] = {
        ...this.state.externalProfiles[existingIndex],
        ...profile
      };
    }
    this.flushToDisk();
  }

  createReviewFetchJob(job: ReviewFetchJob): void {
    this.syncFromDisk();
    this.state.reviewFetchJobs = [
      job,
      ...this.state.reviewFetchJobs.filter((item) => item.id !== job.id)
    ];
    this.flushToDisk();
  }

  updateReviewFetchJob(
    jobId: string,
    patch: Partial<ReviewFetchJob>
  ): ReviewFetchJob | undefined {
    this.syncFromDisk();
    const index = this.state.reviewFetchJobs.findIndex((job) => job.id === jobId);
    if (index === -1) {
      return undefined;
    }
    const updated: ReviewFetchJob = {
      ...this.state.reviewFetchJobs[index],
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString()
    };
    this.state.reviewFetchJobs[index] = updated;
    this.flushToDisk();
    return updated;
  }

  getReviewFetchJobById(jobId: string): ReviewFetchJob | undefined {
    this.syncFromDisk();
    return this.state.reviewFetchJobs.find((job) => job.id === jobId);
  }

  listReviewFetchJobsByHotel(hotelId: string, limit = 20): ReviewFetchJob[] {
    this.syncFromDisk();
    return this.state.reviewFetchJobs
      .filter((job) => job.hotelId === hotelId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(1, Math.min(100, Math.floor(limit))));
  }

  createReviewFetchJobSource(source: ReviewFetchJobSource): void {
    this.syncFromDisk();
    const existingIndex = this.state.reviewFetchJobSources.findIndex(
      (item) => item.jobId === source.jobId && item.source === source.source
    );
    if (existingIndex === -1) {
      this.state.reviewFetchJobSources = [source, ...this.state.reviewFetchJobSources];
    } else {
      this.state.reviewFetchJobSources[existingIndex] = {
        ...this.state.reviewFetchJobSources[existingIndex],
        ...source
      };
    }
    this.flushToDisk();
  }

  updateReviewFetchJobSource(
    sourceId: string,
    patch: Partial<ReviewFetchJobSource>
  ): ReviewFetchJobSource | undefined {
    this.syncFromDisk();
    const index = this.state.reviewFetchJobSources.findIndex((source) => source.id === sourceId);
    if (index === -1) {
      return undefined;
    }
    const updated: ReviewFetchJobSource = {
      ...this.state.reviewFetchJobSources[index],
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString()
    };
    this.state.reviewFetchJobSources[index] = updated;
    this.flushToDisk();
    return updated;
  }

  listReviewFetchJobSources(jobId: string): ReviewFetchJobSource[] {
    this.syncFromDisk();
    return this.state.reviewFetchJobSources
      .filter((source) => source.jobId === jobId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  upsertAnalytics(
    hotelId: string,
    reviews: Review[],
    analyses: ReviewAnalysis[],
    aggregate: HotelAggregate,
    recommendations: Recommendation[],
    run: AnalysisRun
  ): void {
    this.syncFromDisk();
    const preservedReviews = this.state.reviews.filter(
      (review) => review.hotelId !== hotelId
    );
    const preservedAnalyses = this.state.analyses.filter((analysis) => {
      const review = this.state.reviews.find((item) => item.id === analysis.reviewId);
      return review?.hotelId !== hotelId;
    });
    const preservedAggregates = this.state.aggregates.filter(
      (item) => item.hotelId !== hotelId
    );
    const preservedRecommendations = this.state.recommendations.filter(
      (item) => item.hotelId !== hotelId
    );

    this.state.reviews = [...preservedReviews, ...reviews];
    this.state.analyses = [...preservedAnalyses, ...analyses];
    this.state.aggregates = [...preservedAggregates, aggregate];
    this.state.recommendations = [...preservedRecommendations, ...recommendations];
    this.state.runs = [run, ...this.state.runs.filter((item) => item.id !== run.id)];
    this.flushToDisk();
  }

  getSnapshot(): RepositorySnapshot {
    this.syncFromDisk();
    return {
      hotels: this.listHotels(),
      reviews: [...this.state.reviews],
      analyses: [...this.state.analyses],
      aggregates: [...this.state.aggregates],
      recommendations: [...this.state.recommendations],
      runs: [...this.state.runs],
      externalProfiles: [...this.state.externalProfiles],
      reviewFetchJobs: [...this.state.reviewFetchJobs],
      reviewFetchJobSources: [...this.state.reviewFetchJobSources]
    };
  }

  private bootstrapAnalytics(): void {
    if (this.state.analyses.length > 0 || this.state.aggregates.length > 0) {
      return;
    }
    this.state.hotels.forEach((hotel) => {
      const hotelReviews = this.state.reviews.filter((review) => review.hotelId === hotel.id);
      const outcome = runAnalysisForHotel(hotel.id, hotelReviews, "seed");
      this.state.analyses.push(...outcome.analyses);
      this.state.aggregates.push(outcome.aggregate);
      this.state.recommendations.push(...outcome.recommendations);
      this.state.runs.push(outcome.run);
    });
  }

  private syncFromDisk(): void {
    const loaded = this.loadFromDisk();
    if (loaded) {
      this.state = loaded;
      const changed = this.removeLegacyDemoHotels();
      if (changed) {
        this.flushToDisk();
      }
    }
  }

  private removeLegacyDemoHotels(): boolean {
    let changed = false;
    const removableHotelIds = new Set(
      this.state.hotels
        .filter(
          (hotel) =>
            LEGACY_DEMO_HOTEL_IDS.has(hotel.id) ||
            LEGACY_DEMO_HOTEL_NAMES.has(hotel.name) ||
            LEGACY_DEMO_HOTEL_NAMES.has(hotel.name.trim())
        )
        .map((hotel) => hotel.id)
    );

    if (!removableHotelIds.size) {
      return false;
    }

    const removableReviewIds = new Set(
      this.state.reviews
        .filter((review) => removableHotelIds.has(review.hotelId))
        .map((review) => review.id)
    );

    changed = true;
    this.state.hotels = this.state.hotels.filter((hotel) => !removableHotelIds.has(hotel.id));
    this.state.reviews = this.state.reviews.filter(
      (review) => !removableHotelIds.has(review.hotelId)
    );
    this.state.analyses = this.state.analyses.filter(
      (analysis) => !removableReviewIds.has(analysis.reviewId)
    );
    this.state.aggregates = this.state.aggregates.filter(
      (aggregate) => !removableHotelIds.has(aggregate.hotelId)
    );
    this.state.recommendations = this.state.recommendations.filter(
      (item) => !removableHotelIds.has(item.hotelId)
    );
    this.state.runs = this.state.runs.filter((run) => !removableHotelIds.has(run.hotelId));
    this.state.externalProfiles = this.state.externalProfiles.filter(
      (profile) => !removableHotelIds.has(profile.hotelId)
    );
    const removedJobIds = new Set(
      this.state.reviewFetchJobs
        .filter((job) => removableHotelIds.has(job.hotelId))
        .map((job) => job.id)
    );
    this.state.reviewFetchJobs = this.state.reviewFetchJobs.filter(
      (job) => !removableHotelIds.has(job.hotelId)
    );
    this.state.reviewFetchJobSources = this.state.reviewFetchJobSources.filter(
      (source) => !removedJobIds.has(source.jobId)
    );

    return changed;
  }

  private loadFromDisk(): MemoryState | null {
    try {
      if (!fs.existsSync(this.storePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.storePath, "utf8");
      if (!raw.trim()) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<MemoryState>;
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return {
        hotels: parsed.hotels ?? [],
        reviews: parsed.reviews ?? [],
        analyses: parsed.analyses ?? [],
        aggregates: parsed.aggregates ?? [],
        recommendations: parsed.recommendations ?? [],
        runs: parsed.runs ?? [],
        externalProfiles: parsed.externalProfiles ?? [],
        reviewFetchJobs: parsed.reviewFetchJobs ?? [],
        reviewFetchJobSources: parsed.reviewFetchJobSources ?? []
      };
    } catch {
      return null;
    }
  }

  private flushToDisk(): void {
    try {
      const directory = path.dirname(this.storePath);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.state), "utf8");
    } catch {
      // Non-blocking: in-memory state remains usable even if file flush fails.
    }
  }
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function mergeHotel(hotel: Hotel, request: CreateHotelRequest): Hotel {
  const now = new Date().toISOString();

  const nextCountry = (request.country || "").trim();
  const nextBrand = (request.brand || "").trim();
  const nextCategory = (request.category || "").trim();
  const nextAddress = (request.address || "").trim();
  const nextDescription = (request.description || "").trim();
  const nextExternalId = request.externalId?.trim();
  const nextCoordinates = request.coordinates;

  const merged: Hotel = {
    ...hotel,
    country: nextCountry || hotel.country,
    brand: nextBrand || hotel.brand,
    category: nextCategory || hotel.category,
    address: nextAddress || hotel.address,
    description: nextDescription || hotel.description,
    externalId: nextExternalId || hotel.externalId,
    coordinates: nextCoordinates || hotel.coordinates,
    updatedAt: now
  };

  return merged;
}

function canonicalHotelName(name: string, city: string): string {
  const normalized = normalizeHotelMatchValue(name);
  const cityNormalized = normalizeHotelMatchValue(city);
  if (!normalized) {
    return "";
  }

  const citySuffixPattern = new RegExp(`(?:,|\\-|\\s)+${escapeRegExp(cityNormalized)}$`, "i");
  const cleaned = normalized.replace(citySuffixPattern, "").trim();
  return cleaned || normalized;
}

function sameCity(left: string, right: string): boolean {
  return normalizeHotelMatchValue(left) === normalizeHotelMatchValue(right);
}

function normalizeHotelMatchValue(value: string): string {
  const normalized = normalizeSearchText(normalizeWhitespace(value || ""));
  return normalized
    .replace(/\b(отель|гостиница|hotel|hostel|mini-hotel|мини-отель)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyReviewFilters(
  review: Review,
  analysis: ReviewAnalysis,
  query: ReviewsQuery
): boolean {
  if (query.sentiment && analysis.sentimentLabel !== query.sentiment) {
    return false;
  }
  if (query.segment && analysis.primarySegment !== query.segment) {
    return false;
  }
  if (query.topic && !analysis.topics.some((topic) => topic.topic === query.topic)) {
    return false;
  }
  if (query.source && review.source !== query.source) {
    return false;
  }
  if (typeof query.ratingMin === "number" && review.rating < query.ratingMin) {
    return false;
  }
  if (typeof query.ratingMax === "number" && review.rating > query.ratingMax) {
    return false;
  }
  if (query.dateFrom || query.dateTo) {
    const reviewTs = new Date(review.reviewDate).getTime();
    if (query.dateFrom) {
      const fromTs = new Date(query.dateFrom).getTime();
      if (!Number.isNaN(fromTs) && reviewTs < fromTs) {
        return false;
      }
    }
    if (query.dateTo) {
      const toTs = new Date(query.dateTo).getTime();
      if (!Number.isNaN(toTs) && reviewTs > toTs + 24 * 60 * 60 * 1000) {
        return false;
      }
    }
  }
  if (query.search) {
    const search = query.search.toLocaleLowerCase("ru-RU");
    const hasMatch =
      review.text.toLocaleLowerCase("ru-RU").includes(search) ||
      review.title?.toLocaleLowerCase("ru-RU").includes(search) ||
      analysis.keywords.some((keyword) => keyword.includes(search));
    if (!hasMatch) {
      return false;
    }
  }
  return true;
}
