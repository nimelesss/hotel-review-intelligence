import {
  AnalysisRun,
  CreateHotelRequest,
  DashboardPayload,
  Hotel,
  HotelAggregate,
  Recommendation,
  Review,
  ReviewAnalysis,
  ReviewsQuery,
  ReviewsQueryResult,
  SegmentAnalyticsPayload
} from "@/entities/types";

export interface RepositorySnapshot {
  hotels: Hotel[];
  reviews: Review[];
  analyses: ReviewAnalysis[];
  aggregates: HotelAggregate[];
  recommendations: Recommendation[];
  runs: AnalysisRun[];
}

export interface IntelligenceRepository {
  listHotels(): Hotel[];
  createHotel(request: CreateHotelRequest): Hotel;
  getHotelById(hotelId: string): Hotel | undefined;
  listReviewsByHotel(hotelId: string): Review[];
  listAnalysesByHotel(hotelId: string): ReviewAnalysis[];
  getAggregateByHotel(hotelId: string): HotelAggregate | undefined;
  listRecommendationsByHotel(hotelId: string): Recommendation[];
  listRunsByHotel(hotelId: string): AnalysisRun[];
  queryReviews(query: ReviewsQuery): ReviewsQueryResult;
  createRun(run: AnalysisRun): void;
  updateRun(runId: string, patch: Partial<AnalysisRun>): AnalysisRun | undefined;
  getRunById(runId: string): AnalysisRun | undefined;
  upsertAnalytics(
    hotelId: string,
    reviews: Review[],
    analyses: ReviewAnalysis[],
    aggregate: HotelAggregate,
    recommendations: Recommendation[],
    run: AnalysisRun
  ): void;
  getSnapshot(): RepositorySnapshot;
}

export interface DashboardService {
  getDashboard(hotelId: string): DashboardPayload;
  getSegmentAnalytics(hotelId: string): SegmentAnalyticsPayload;
}
