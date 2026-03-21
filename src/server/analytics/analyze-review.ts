import {
  Review,
  ReviewAnalysis,
  SegmentId,
  TopicId
} from "@/entities/types";
import { ANALYSIS_VERSION } from "@/shared/config/constants";
import { createId } from "@/shared/lib/id";
import { preprocessReviewText } from "@/server/analytics/preprocess";
import { scoreSentiment } from "@/server/analytics/sentiment";
import { detectTopics } from "@/server/analytics/topics";
import { scoreSegments } from "@/server/analytics/segments";
import {
  buildExplanations,
  buildManagerImpact
} from "@/server/analytics/explainability";
import { detectRiskFlags } from "@/server/analytics/rules/risk-rules";

export function analyzeReview(review: Review): ReviewAnalysis {
  const processed = preprocessReviewText(review.cleanedText || review.text);
  const sentiment = scoreSentiment({
    markers: processed.markers,
    tokens: processed.tokens,
    rating: review.rating
  });
  const topics = detectTopics({
    markers: processed.markers,
    sentimentScore: sentiment.score
  });
  const segment = scoreSegments({
    markers: processed.markers,
    rating: review.rating,
    stayTypeRaw: review.stayTypeRaw
  });
  const riskFlags = detectRiskFlags(processed.loweredText, topics.topics);
  const topicKeywords = collectTopicKeywords(topics.topicIds, processed.markers);
  const explanations = buildExplanations({
    sentimentLabel: sentiment.label,
    sentimentScore: sentiment.score,
    sentimentEvidence: sentiment.evidence,
    topicIds: topics.topicIds,
    topicKeywords,
    primarySegment: segment.primarySegment,
    segmentConfidence: segment.confidence,
    segmentRationale: segment.rationale,
    segmentMarkers: segment.matchedMarkers,
    riskFlags
  });
  const managerImpact = buildManagerImpact(
    sentiment.label,
    segment.primarySegment,
    topics.topicIds,
    riskFlags
  );

  return {
    id: createId("analysis"),
    reviewId: review.id,
    sentimentLabel: sentiment.label,
    sentimentScore: sentiment.score,
    topics: topics.topics,
    keywords: processed.tokens.slice(0, 20),
    segmentScores: segment.segmentScores,
    primarySegment: segment.primarySegment,
    confidence: segment.confidence,
    explanation: explanations,
    managerImpact,
    riskFlags,
    analyzedAt: new Date().toISOString(),
    analysisVersion: ANALYSIS_VERSION
  };
}

function collectTopicKeywords(topicIds: TopicId[], markers: string[]): string[] {
  if (!topicIds.length) {
    return [];
  }
  const buckets: Record<string, string[]> = {};
  topicIds.forEach((topic) => {
    buckets[topic] = [];
  });

  markers.forEach((marker) => {
    topicIds.forEach((topic) => {
      if (marker.includes(topicToKeyword(topic))) {
        buckets[topic].push(marker);
      }
    });
  });

  return Object.values(buckets).flat().slice(0, 8);
}

function topicToKeyword(topic: TopicId): string {
  const map: Record<TopicId, string> = {
    cleanliness: "чист",
    service: "сервис",
    location: "располож",
    breakfast: "завтрак",
    wifi: "wifi",
    parking: "парковк",
    silence: "тиш",
    room: "номер",
    checkin_checkout: "check",
    restaurant_food: "ресторан",
    value_for_money: "цен",
    business_infrastructure: "делов",
    sleep_comfort: "сон",
    staff: "персонал"
  };
  return map[topic];
}

export function getTopSegmentIds(
  scores: Record<SegmentId, number>,
  limit = 3
): SegmentId[] {
  return (Object.entries(scores) as Array<[SegmentId, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([segmentId]) => segmentId);
}
