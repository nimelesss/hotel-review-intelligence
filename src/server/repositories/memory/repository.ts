import fs from "node:fs";
import path from "node:path";
import {
  AnalysisRun,
  CreateHotelRequest,
  Hotel,
  HotelAggregate,
  Recommendation,
  Review,
  ReviewAnalysis,
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

interface MemoryState {
  hotels: Hotel[];
  reviews: Review[];
  analyses: ReviewAnalysis[];
  aggregates: HotelAggregate[];
  recommendations: Recommendation[];
  runs: AnalysisRun[];
}

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
      runs: seed?.runs ?? []
    };

    const loaded = this.loadFromDisk();
    this.state = loaded ?? seededState;
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
      throw new Error("Hotel name and city are required.");
    }

    const duplicate = this.state.hotels.find(
      (hotel) =>
        hotel.name.toLocaleLowerCase("ru-RU") ===
          normalizedName.toLocaleLowerCase("ru-RU") &&
        hotel.city.toLocaleLowerCase("ru-RU") ===
          normalizedCity.toLocaleLowerCase("ru-RU")
    );
    if (duplicate) {
      return duplicate;
    }

    const now = new Date().toISOString();
    const hotel: Hotel = {
      id: `hotel-${slugify(normalizedName)}-${slugify(normalizedCity)}-${Date.now()
        .toString()
        .slice(-5)}`,
      name: normalizedName,
      city: normalizedCity,
      country: (request.country || "Russia").trim(),
      brand: (request.brand || "Independent").trim(),
      category: (request.category || "4*").trim(),
      address: (request.address || `${normalizedCity}, ${request.country || "Russia"}`).trim(),
      description:
        (request.description ||
          "Hotel profile created by user. Analytics will be generated after data ingestion.").trim(),
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
      runs: [...this.state.runs]
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
    }
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
      const parsed = JSON.parse(raw) as MemoryState;
      return parsed;
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
