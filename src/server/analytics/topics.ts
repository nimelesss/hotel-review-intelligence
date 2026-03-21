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

export function detectTopics(input: TopicSignalInput): TopicDetectionResult {
  const markerSet = new Set(input.markers);
  const topics: TopicSentiment[] = [];

  TOPICS.forEach((topic) => {
    const matchedKeywords = topic.markers.filter((marker) =>
      hasMarker(markerSet, marker)
    );
    if (!matchedKeywords.length) {
      return;
    }

    const mentionStrength = clamp(matchedKeywords.length / 3, 0.2, 1);
    const topicScore = clamp(input.sentimentScore * mentionStrength, -1, 1);
    topics.push({
      topic: topic.id,
      sentimentLabel: toSentimentLabel(topicScore),
      sentimentScore: topicScore,
      confidence: clamp(0.45 + mentionStrength * 0.45, 0.45, 0.95),
      matchedKeywords
    });
  });

  return {
    topicIds: topics.map((topic) => topic.topic),
    topics
  };
}

function hasMarker(markerSet: Set<string>, marker: string): boolean {
  if (markerSet.has(marker)) {
    return true;
  }
  const fragments = marker.split(" ");
  return fragments.every((fragment) =>
    [...markerSet].some((value) => value.includes(fragment))
  );
}

function toSentimentLabel(score: number): SentimentLabel {
  if (score > 0.2) {
    return "positive";
  }
  if (score < -0.2) {
    return "negative";
  }
  return "neutral";
}
