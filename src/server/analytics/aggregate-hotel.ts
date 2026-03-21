import {
  DistributionItem,
  DriverItem,
  HotelAggregate,
  Review,
  ReviewAnalysis,
  SegmentId,
  SegmentInsight,
  TopicDistributionItem,
  TopicId
} from "@/entities/types";
import { SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";
import { createId } from "@/shared/lib/id";
import { clamp, toFixedSafe } from "@/shared/lib/format";

const TRACKED_SEGMENTS: SegmentId[] = [
  "business_traveler",
  "family",
  "couple",
  "transit_guest",
  "event_guest",
  "solo_traveler",
  "mixed",
  "unclassified"
];

const TRACKED_TOPICS: TopicId[] = [
  "cleanliness",
  "service",
  "location",
  "breakfast",
  "wifi",
  "parking",
  "silence",
  "room",
  "checkin_checkout",
  "restaurant_food",
  "value_for_money",
  "business_infrastructure",
  "sleep_comfort",
  "staff"
];

export function aggregateHotelAnalytics(
  hotelId: string,
  reviews: Review[],
  analyses: ReviewAnalysis[]
): HotelAggregate {
  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0
      ? toFixedSafe(
          reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews,
          2
        )
      : 0;
  const overallSentiment =
    totalReviews > 0
      ? toFixedSafe(
          analyses.reduce((sum, analysis) => sum + analysis.sentimentScore, 0) / totalReviews,
          3
        )
      : 0;

  const segmentDistribution = buildSegmentDistribution(analyses, totalReviews);
  const dominantSegment = segmentDistribution[0]?.id ?? "unclassified";
  const topicDistribution = buildTopicDistribution(analyses, totalReviews);
  const positiveDrivers = buildDrivers(topicDistribution, "positive");
  const negativeDrivers = buildDrivers(topicDistribution, "negative");
  const keyRisks = buildRiskSummary(topicDistribution, analyses);
  const growthOpportunities = buildGrowthOpportunities(positiveDrivers, segmentDistribution);
  const segmentInsights = buildSegmentInsights(analyses, totalReviews);

  return {
    id: createId("aggregate"),
    hotelId,
    totalReviews,
    averageRating,
    overallSentiment,
    dominantSegment,
    segmentDistribution,
    topicDistribution,
    positiveDrivers,
    negativeDrivers,
    keyRisks,
    growthOpportunities,
    segmentInsights,
    updatedAt: new Date().toISOString()
  };
}

function buildSegmentDistribution(
  analyses: ReviewAnalysis[],
  totalReviews: number
): DistributionItem<SegmentId>[] {
  const counts = TRACKED_SEGMENTS.reduce<Record<SegmentId, number>>((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {} as Record<SegmentId, number>);
  const sentimentBySegment = TRACKED_SEGMENTS.reduce<Record<SegmentId, number[]>>((acc, id) => {
    acc[id] = [];
    return acc;
  }, {} as Record<SegmentId, number[]>);

  analyses.forEach((analysis) => {
    counts[analysis.primarySegment] += 1;
    sentimentBySegment[analysis.primarySegment].push(analysis.sentimentScore);
  });

  return TRACKED_SEGMENTS.map((segmentId) => {
    const count = counts[segmentId];
    const sentimentValues = sentimentBySegment[segmentId];
    const avgSentiment =
      sentimentValues.length > 0
        ? sentimentValues.reduce((sum, value) => sum + value, 0) / sentimentValues.length
        : 0;
    return {
      id: segmentId,
      label: SEGMENT_LABELS[segmentId],
      count,
      share: totalReviews > 0 ? count / totalReviews : 0,
      sentimentScore: toFixedSafe(avgSentiment, 3)
    };
  }).sort((a, b) => b.share - a.share);
}

function buildTopicDistribution(
  analyses: ReviewAnalysis[],
  totalReviews: number
): TopicDistributionItem[] {
  return TRACKED_TOPICS.map((topic) => {
    const topicEntries = analyses.flatMap((analysis) =>
      analysis.topics.filter((item) => item.topic === topic)
    );
    const mentions = topicEntries.length;
    const positiveMentions = topicEntries.filter(
      (item) => item.sentimentLabel === "positive"
    ).length;
    const negativeMentions = topicEntries.filter(
      (item) => item.sentimentLabel === "negative"
    ).length;
    const averageSentiment =
      mentions > 0
        ? topicEntries.reduce((sum, item) => sum + item.sentimentScore, 0) / mentions
        : 0;

    return {
      topic,
      label: TOPIC_LABELS[topic],
      mentions,
      positiveMentions,
      negativeMentions,
      averageSentiment: toFixedSafe(averageSentiment, 3),
      riskLevel: calculateRiskLevel(mentions, negativeMentions, totalReviews)
    };
  }).filter((item) => item.mentions > 0);
}

function buildDrivers(
  topicDistribution: TopicDistributionItem[],
  type: "positive" | "negative"
): DriverItem[] {
  return topicDistribution
    .map((topic) => {
      const volumeFactor = topic.mentions;
      const sentimentFactor =
        type === "positive"
          ? Math.max(topic.averageSentiment, 0)
          : Math.abs(Math.min(topic.averageSentiment, 0));
      const score = sentimentFactor * volumeFactor;
      return {
        topic: topic.topic,
        label: topic.label,
        score: toFixedSafe(score, 3),
        mentionShare: toFixedSafe(
          topic.mentions / Math.max(1, topicDistribution.reduce((sum, item) => sum + item.mentions, 0)),
          3
        ),
        evidence: [
          `Упоминаний: ${topic.mentions}`,
          `Средний тон: ${topic.averageSentiment.toFixed(2)}`
        ]
      };
    })
    .filter((driver) => driver.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildRiskSummary(
  topicDistribution: TopicDistributionItem[],
  analyses: ReviewAnalysis[]
): string[] {
  const highRiskTopics = topicDistribution
    .filter((topic) => topic.riskLevel === "high")
    .map((topic) => `Высокий риск: ${topic.label}`);

  const recurringFlags = analyses.flatMap((analysis) => analysis.riskFlags).reduce<Record<string, number>>(
    (acc, flag) => {
      acc[flag] = (acc[flag] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const frequentFlags = Object.entries(recurringFlags)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([flag, count]) => `${flag} (${count})`);

  return [...highRiskTopics, ...frequentFlags].slice(0, 5);
}

function buildGrowthOpportunities(
  positiveDrivers: DriverItem[],
  segmentDistribution: DistributionItem<SegmentId>[]
): string[] {
  const opportunities: string[] = [];

  const businessSegment = segmentDistribution.find((item) => item.id === "business_traveler");
  if (businessSegment && businessSegment.share > 0.25) {
    opportunities.push(
      "Бизнес-сегмент формирует значимую часть спроса: усилить коммуникацию про Wi-Fi, рабочее место и скорость сервиса."
    );
  }

  const locationDriver = positiveDrivers.find((driver) => driver.topic === "location");
  if (locationDriver) {
    opportunities.push(
      "Сильная тема расположения: выделить транспортные преимущества в карточках отеля и рекламе."
    );
  }

  const familySegment = segmentDistribution.find((item) => item.id === "family");
  if (familySegment && familySegment.share < 0.12) {
    opportunities.push(
      "Семейный сегмент недораскрыт: протестировать семейные тарифы и пакетные предложения на выходные."
    );
  }

  return opportunities.slice(0, 5);
}

function buildSegmentInsights(analyses: ReviewAnalysis[], totalReviews: number): SegmentInsight[] {
  return TRACKED_SEGMENTS.map((segment) => {
    const current = analyses.filter((analysis) => analysis.primarySegment === segment);
    if (!current.length) {
      return {
        segment,
        label: SEGMENT_LABELS[segment],
        share: 0,
        averageSentiment: 0,
        valuedTopics: [],
        complaintTopics: [],
        businessMeaning: "Недостаточно данных по сегменту.",
        confidenceNote: "Сегмент слабо представлен в выборке, выводы индикативны."
      };
    }

    const topicScores = current.flatMap((analysis) => analysis.topics);
    const grouped = groupTopics(topicScores);
    const valuedTopics = grouped
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.topic);
    const complaintTopics = grouped
      .filter((item) => item.score < 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((item) => item.topic);

    const avgSentiment = current.reduce((sum, analysis) => sum + analysis.sentimentScore, 0) / current.length;

    return {
      segment,
      label: SEGMENT_LABELS[segment],
      share: toFixedSafe(current.length / Math.max(totalReviews, 1), 3),
      averageSentiment: toFixedSafe(avgSentiment, 3),
      valuedTopics,
      complaintTopics,
      businessMeaning: buildBusinessMeaning(segment, avgSentiment, valuedTopics),
      confidenceNote:
        current.length < 4
          ? "Низкая статистическая насыщенность: желательно увеличить массив отзывов."
          : "Объем данных достаточен для приоритизации управленческих действий."
    };
  }).sort((a, b) => b.share - a.share);
}

function groupTopics(
  topics: Array<{ topic: TopicId; sentimentScore: number }>
): Array<{ topic: TopicId; score: number }> {
  const bucket: Record<TopicId, number[]> = {
    cleanliness: [],
    service: [],
    location: [],
    breakfast: [],
    wifi: [],
    parking: [],
    silence: [],
    room: [],
    checkin_checkout: [],
    restaurant_food: [],
    value_for_money: [],
    business_infrastructure: [],
    sleep_comfort: [],
    staff: []
  };
  topics.forEach((topic) => {
    bucket[topic.topic].push(topic.sentimentScore);
  });
  return (Object.entries(bucket) as Array<[TopicId, number[]]>)
    .filter(([, values]) => values.length > 0)
    .map(([topic, values]) => ({
      topic,
      score: values.reduce((sum, value) => sum + value, 0) / values.length
    }));
}

function buildBusinessMeaning(segment: SegmentId, avgSentiment: number, valuedTopics: TopicId[]): string {
  const base =
    segment === "business_traveler"
      ? "Сегмент формирует загрузку в будние дни."
      : segment === "family"
      ? "Сегмент влияет на выходную загрузку и дополнительную выручку."
      : segment === "couple"
      ? "Сегмент поддерживает leisure-позиционирование объекта."
      : segment === "transit_guest"
      ? "Сегмент важен для краткосрочной загрузки на транзитных маршрутах."
      : segment === "event_guest"
      ? "Сегмент критичен в периоды событийного спроса."
      : segment === "solo_traveler"
      ? "Сегмент чувствителен к цене и скорости сервиса."
      : "Сегмент требует дополнительной детализации.";

  const topicHint =
    valuedTopics.length > 0
      ? `Ключевые ценности: ${valuedTopics
          .slice(0, 2)
          .map((topic) => TOPIC_LABELS[topic])
          .join(", ")}.`
      : "Выраженные ценностные темы пока не определены.";

  const sentimentHint =
    avgSentiment < -0.2
      ? "Есть риск снижения лояльности, нужен операционный фокус."
      : avgSentiment > 0.2
      ? "Сегмент можно активнее использовать в маркетинговом позиционировании."
      : "Тональность нейтральная, нужны точечные улучшения клиентского пути.";

  return `${base} ${topicHint} ${sentimentHint}`;
}

function calculateRiskLevel(
  mentions: number,
  negativeMentions: number,
  totalReviews: number
): "low" | "medium" | "high" {
  const mentionShare = mentions / Math.max(totalReviews, 1);
  const negativeShare = mentions > 0 ? negativeMentions / mentions : 0;
  const riskIndex = clamp(mentionShare * 0.6 + negativeShare * 0.8, 0, 1);

  if (riskIndex >= 0.55) {
    return "high";
  }
  if (riskIndex >= 0.3) {
    return "medium";
  }
  return "low";
}
