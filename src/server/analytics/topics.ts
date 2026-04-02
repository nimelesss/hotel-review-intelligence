import {
  SentimentLabel,
  TopicId,
  TopicSentiment
} from "@/entities/types";
import { TOPICS } from "@/shared/config/taxonomy";
import { clamp } from "@/shared/lib/format";

interface TopicSignalInput {
  markers: string[];
  sentimentScore: number;
}

export interface TopicDetectionResult {
  topicIds: TopicId[];
  topics: TopicSentiment[];
}

/**
 * Minimum confidence: lowered from 0.45 to 0.15.
 * Single keyword match = 0.25 confidence (was 0.45 — too high).
 * 3+ keywords = 0.85+ confidence.
 */
const CONFIDENCE_BASE = 0.15;
const CONFIDENCE_SLOPE = 0.25;
const CONFIDENCE_MAX = 0.95;

export function detectTopics(input: TopicSignalInput): TopicDetectionResult {
  const markerSet = new Set(input.markers);
  const topics: TopicSentiment[] = [];

  TOPICS.forEach((topic) => {
    const matchedKeywords = topic.markers.flatMap((marker) =>
      findMatchedKeywords(markerSet, marker)
    );
    if (!matchedKeywords.length) {
      return;
    }

    const mentionStrength = clamp(matchedKeywords.length / 3, 0.1, 1);
    const topicScore = clamp(input.sentimentScore * mentionStrength, -1, 1);
    const confidence = clamp(
      CONFIDENCE_BASE + matchedKeywords.length * CONFIDENCE_SLOPE,
      CONFIDENCE_BASE,
      CONFIDENCE_MAX
    );

    topics.push({
      topic: topic.id,
      sentimentLabel: toSentimentLabel(topicScore),
      sentimentScore: topicScore,
      confidence,
      matchedKeywords
    });
  });

  return {
    topicIds: topics.map((topic) => topic.topic),
    topics
  };
}

function findMatchedKeywords(markerSet: Set<string>, marker: string): string[] {
  const directMatches = [...markerSet].filter((value) => {
    if (value === marker) {
      return true;
    }
    const fragments = marker.split(" ");
    return fragments.every((fragment) => value.includes(fragment));
  });

  return [...new Set(directMatches)].slice(0, 3);
}

function toSentimentLabel(score: number): SentimentLabel {
  if (score > 0.15) {
    return "positive";
  }
  if (score < -0.15) {
    return "negative";
  }
  return "neutral";
}
