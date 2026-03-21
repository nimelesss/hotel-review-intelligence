import {
  AnalysisRun,
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

  constructor(seed?: Partial<MemoryState>) {
    const baseState: MemoryState = {
      hotels: seed?.hotels ?? seedHotels,
      reviews: seed?.reviews ?? seedReviews,
      analyses: seed?.analyses ?? [],
      aggregates: seed?.aggregates ?? [],
      recommendations: seed?.recommendations ?? [],
      runs: seed?.runs ?? []
    };
    this.state = baseState;
    this.bootstrapAnalytics();
  }

  listHotels(): Hotel[] {
    return [...this.state.hotels];
  }

  getHotelById(hotelId: string): Hotel | undefined {
    return this.state.hotels.find((hotel) => hotel.id === hotelId);
  }

  listReviewsByHotel(hotelId: string): Review[] {
    return this.state.reviews.filter((review) => review.hotelId === hotelId);
  }

  listAnalysesByHotel(hotelId: string): ReviewAnalysis[] {
    const reviewIds = new Set(
      this.state.reviews
        .filter((review) => review.hotelId === hotelId)
        .map((review) => review.id)
    );
    return this.state.analyses.filter((analysis) => reviewIds.has(analysis.reviewId));
  }

  getAggregateByHotel(hotelId: string): HotelAggregate | undefined {
    return this.state.aggregates.find((aggregate) => aggregate.hotelId === hotelId);
  }

  listRecommendationsByHotel(hotelId: string): Recommendation[] {
    return this.state.recommendations.filter(
      (recommendation) => recommendation.hotelId === hotelId
    );
  }

  listRunsByHotel(hotelId: string): AnalysisRun[] {
    return this.state.runs
      .filter((run) => run.hotelId === hotelId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  queryReviews(query: ReviewsQuery): ReviewsQueryResult {
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

  upsertAnalytics(
    hotelId: string,
    reviews: Review[],
    analyses: ReviewAnalysis[],
    aggregate: HotelAggregate,
    recommendations: Recommendation[],
    run: AnalysisRun
  ): void {
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
    this.state.runs = [run, ...this.state.runs];
  }

  getSnapshot(): RepositorySnapshot {
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
    if (this.state.analyses.length > 0) {
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
