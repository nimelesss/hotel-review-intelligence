import {
  AnalysisRun,
  AnalysisRunSourceType,
  HotelAggregate,
  Recommendation,
  Review,
  ReviewAnalysis
} from "@/entities/types";
import { ANALYSIS_VERSION } from "@/shared/config/constants";
import { createId } from "@/shared/lib/id";
import { analyzeReview } from "@/server/analytics/analyze-review";
import { aggregateHotelAnalytics } from "@/server/analytics/aggregate-hotel";
import { buildRecommendations } from "@/server/analytics/recommendations";

export interface AnalysisOutcome {
  analyses: ReviewAnalysis[];
  aggregate: HotelAggregate;
  recommendations: Recommendation[];
  run: AnalysisRun;
}

export function runAnalysisForHotel(
  hotelId: string,
  reviews: Review[],
  sourceType: AnalysisRunSourceType
): AnalysisOutcome {
  const startedAt = new Date().toISOString();
  const analyses = reviews.map((review) => analyzeReview(review));
  const aggregate = aggregateHotelAnalytics(hotelId, reviews, analyses);
  const recommendations = buildRecommendations(hotelId, aggregate);
  const run: AnalysisRun = {
    id: createId("run"),
    hotelId,
    sourceType,
    totalReviewsProcessed: reviews.length,
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    analysisVersion: ANALYSIS_VERSION,
    notes: "Analysis completed with explainable hybrid rules."
  };

  return {
    analyses,
    aggregate,
    recommendations,
    run
  };
}
