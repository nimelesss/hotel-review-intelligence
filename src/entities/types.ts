export type UUID = string;

export type SentimentLabel = "positive" | "neutral" | "negative";
export type SegmentId =
  | "business_traveler"
  | "family"
  | "couple"
  | "transit_guest"
  | "event_guest"
  | "solo_traveler"
  | "mixed"
  | "unclassified";
export type TopicId =
  | "cleanliness"
  | "service"
  | "location"
  | "breakfast"
  | "wifi"
  | "parking"
  | "silence"
  | "room"
  | "checkin_checkout"
  | "restaurant_food"
  | "value_for_money"
  | "business_infrastructure"
  | "sleep_comfort"
  | "staff";

export type RiskLevel = "low" | "medium" | "high";
export type RecommendationCategory =
  | "marketing"
  | "operations"
  | "reputation"
  | "strategy";
export type RecommendationPriority = "low" | "medium" | "high";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface Hotel {
  id: UUID;
  name: string;
  brand: string;
  city: string;
  country: string;
  category: string;
  address: string;
  coordinates?: Coordinates;
  description: string;
  externalId?: string;
  reviewCount?: number;
  latestReviewDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReviewSource =
  | "booking.com"
  | "yandex"
  | "2gis"
  | "flamp"
  | "ostrovok"
  | "otzovik"
  | "yell"
  | "sutochno"
  | "bronevik"
  | "tripadvisor"
  | "manual_upload"
  | "mock_api"
  | "apify_dataset";

export interface Review {
  id: UUID;
  hotelId: UUID;
  source: ReviewSource;
  sourceReviewId?: string;
  reviewDate: string;
  rating: number;
  title?: string;
  text: string;
  cleanedText: string;
  language: string;
  authorName?: string;
  stayTypeRaw?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TopicSentiment {
  topic: TopicId;
  sentimentLabel: SentimentLabel;
  sentimentScore: number;
  confidence: number;
  matchedKeywords: string[];
}

export interface ReviewExplanation {
  type: "sentiment" | "topic" | "segment" | "risk" | "business";
  title: string;
  details: string;
  evidence: string[];
}

export interface ManagerImpact {
  summary: string;
  operationalSignal: string;
  marketingSignal: string;
}

export interface ReviewAnalysis {
  id: UUID;
  reviewId: UUID;
  sentimentLabel: SentimentLabel;
  sentimentScore: number;
  topics: TopicSentiment[];
  keywords: string[];
  segmentScores: Record<SegmentId, number>;
  primarySegment: SegmentId;
  confidence: number;
  explanation: ReviewExplanation[];
  managerImpact: ManagerImpact;
  riskFlags: string[];
  analyzedAt: string;
  analysisVersion: string;
}

export interface DistributionItem<T extends string> {
  id: T;
  label: string;
  count: number;
  share: number;
  sentimentScore?: number;
}

export interface TopicDistributionItem {
  topic: TopicId;
  label: string;
  mentions: number;
  positiveMentions: number;
  negativeMentions: number;
  averageSentiment: number;
  riskLevel: RiskLevel;
}

export interface DriverItem {
  topic: TopicId;
  label: string;
  score: number;
  mentionShare: number;
  evidence: string[];
}

export interface SegmentInsight {
  segment: SegmentId;
  label: string;
  share: number;
  averageSentiment: number;
  valuedTopics: TopicId[];
  complaintTopics: TopicId[];
  businessMeaning: string;
  confidenceNote: string;
}

export interface HotelAggregate {
  id: UUID;
  hotelId: UUID;
  totalReviews: number;
  averageRating: number;
  overallSentiment: number;
  dominantSegment: SegmentId;
  segmentDistribution: DistributionItem<SegmentId>[];
  topicDistribution: TopicDistributionItem[];
  positiveDrivers: DriverItem[];
  negativeDrivers: DriverItem[];
  keyRisks: string[];
  growthOpportunities: string[];
  segmentInsights: SegmentInsight[];
  updatedAt: string;
}

export interface Recommendation {
  id: UUID;
  hotelId: UUID;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  rationale: string;
  relatedSegments: SegmentId[];
  relatedTopics: TopicId[];
  impactScore: number;
  effortScore: number;
  createdAt: string;
  updatedAt: string;
}

export type AnalysisRunStatus = "pending" | "running" | "completed" | "failed";

export type AnalysisRunSourceType =
  | "csv"
  | "json"
  | "seed"
  | "mock_api"
  | "platform_api";
export type PlatformProvider =
  | "yandex_maps_dataset"
  | "two_gis_dataset"
  | "ostrovok_dataset"
  | "russian_travel_dataset"
  | "apify_dataset";

export interface AnalysisRun {
  id: UUID;
  hotelId: UUID;
  sourceType: AnalysisRunSourceType;
  totalReviewsProcessed: number;
  status: AnalysisRunStatus;
  startedAt: string;
  completedAt?: string;
  analysisVersion: string;
  notes?: string;
  progressPct?: number;
  stage?: string;
  errorMessage?: string;
  fetchedReviews?: number;
  provider?: PlatformProvider;
}

export interface ExecutiveSummary {
  averageRating: number;
  totalReviews: number;
  overallSentimentLabel: SentimentLabel;
  dominantSegment: SegmentId;
  keyInsight: string;
  keyRisk: string;
  keyOpportunity: string;
}

export interface SourceCoverageItem {
  source: ReviewSource;
  label: string;
  reviews: number;
  share: number;
  averageRating: number;
  averageSentiment: number;
  lastReviewDate?: string;
}

export interface DashboardDataHealth {
  lastReviewDate?: string;
  trackedSources: number;
  reviewCoverageSummary: string;
}

export interface DashboardPayload {
  hotel: Hotel;
  aggregate: HotelAggregate;
  recommendationsPreview: Recommendation[];
  sampleExplainedReviews: Array<{
    review: Review;
    analysis: ReviewAnalysis;
  }>;
  sourceCoverage: SourceCoverageItem[];
  dataHealth: DashboardDataHealth;
  latestRun?: AnalysisRun;
  executiveSummary: ExecutiveSummary;
}

export interface ReviewsQuery {
  hotelId: string;
  sentiment?: SentimentLabel;
  segment?: SegmentId;
  topic?: TopicId;
  source?: ReviewSource;
  ratingMin?: number;
  ratingMax?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface ReviewsQueryResult {
  total: number;
  items: Array<{
    review: Review;
    analysis: ReviewAnalysis;
  }>;
}

export interface SegmentAnalyticsPayload {
  hotel: Hotel;
  segmentDistribution: DistributionItem<SegmentId>[];
  segmentInsights: SegmentInsight[];
  markerNotes: string[];
}

export interface RecommendationPayload {
  hotel: Hotel;
  recommendations: Recommendation[];
}

export interface IngestionRawRow {
  hotelId?: string;
  source?: string;
  sourceReviewId?: string;
  reviewDate?: string;
  rating?: string | number;
  title?: string;
  text?: string;
  language?: string;
  authorName?: string;
  stayTypeRaw?: string;
}

export interface IngestionValidationIssue {
  row: number;
  field: string;
  message: string;
}

export interface IngestionPreviewResult {
  totalRows: number;
  validRows: number;
  duplicates: number;
  issues: IngestionValidationIssue[];
  normalizedPreview: Review[];
}

export interface IngestionImportRequest {
  hotelId: string;
  sourceType: AnalysisRunSourceType;
  payload: string;
  fileType: "csv" | "json";
}

export interface CreateHotelRequest {
  name: string;
  city: string;
  country: string;
  brand?: string;
  category?: string;
  address?: string;
  description?: string;
  coordinates?: Coordinates;
  externalId?: string;
}

export interface HotelSearchResult {
  externalId: string;
  name: string;
  city: string;
  country: string;
  address: string;
  coordinates?: Coordinates;
  source: "osm_nominatim" | "catalog_seed" | "catalog_import";
}

export interface PlatformIngestionRequest {
  hotelId: string;
  provider: PlatformProvider;
  query?: string;
  language?: string;
  limit?: number;
  datasetUrl?: string;
  apifyDatasetUrl?: string;
}
