import {
  ManagerImpact,
  ReviewExplanation,
  SegmentId,
  SentimentLabel,
  TopicId
} from "@/entities/types";
import { SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";

interface ExplainabilityInput {
  sentimentLabel: SentimentLabel;
  sentimentScore: number;
  sentimentEvidence: string[];
  topicIds: TopicId[];
  topicKeywords: string[];
  primarySegment: SegmentId;
  segmentConfidence: number;
  segmentRationale: string;
  segmentMarkers: string[];
  riskFlags: string[];
}

export function buildExplanations(input: ExplainabilityInput): ReviewExplanation[] {
  const explanations: ReviewExplanation[] = [
    {
      type: "sentiment",
      title: `Тональность: ${translateSentiment(input.sentimentLabel)}`,
      details: `Итоговый sentiment score: ${input.sentimentScore.toFixed(2)}.`,
      evidence: input.sentimentEvidence
    },
    {
      type: "topic",
      title: "Обнаруженные темы",
      details:
        input.topicIds.length > 0
          ? input.topicIds.map((topic) => TOPIC_LABELS[topic]).join(", ")
          : "Явные темы не выявлены.",
      evidence: input.topicKeywords.slice(0, 8)
    },
    {
      type: "segment",
      title: `Сегмент: ${SEGMENT_LABELS[input.primarySegment]}`,
      details: `${input.segmentRationale} Уверенность ${(
        input.segmentConfidence * 100
      ).toFixed(1)}%.`,
      evidence: input.segmentMarkers
    }
  ];

  if (input.riskFlags.length) {
    explanations.push({
      type: "risk",
      title: "Репутационные сигналы",
      details: "Обнаружены маркеры потенциального операционного или репутационного риска.",
      evidence: input.riskFlags
    });
  }

  return explanations;
}

export function buildManagerImpact(
  sentimentLabel: SentimentLabel,
  primarySegment: SegmentId,
  topicIds: TopicId[],
  riskFlags: string[]
): ManagerImpact {
  const primaryTopic = topicIds[0] ? TOPIC_LABELS[topicIds[0]] : "общий опыт";
  const summary = `Отзыв отражает ${
    sentimentLabel === "positive"
      ? "позитивный"
      : sentimentLabel === "negative"
      ? "негативный"
      : "нейтральный"
  } опыт для сегмента "${SEGMENT_LABELS[primarySegment]}".`;

  const operationalSignal =
    riskFlags.length > 0
      ? `Требуется операционная проверка: ${riskFlags.join("; ")}.`
      : `Сигнал для операционного качества в теме "${primaryTopic}".`;

  const marketingSignal =
    sentimentLabel === "positive"
      ? `Тему "${primaryTopic}" можно усиливать в коммуникациях.`
      : `Коммуникацию по теме "${primaryTopic}" стоит скорректировать, чтобы снизить ожидания-разрывы.`;

  return {
    summary,
    operationalSignal,
    marketingSignal
  };
}

function translateSentiment(label: SentimentLabel): string {
  if (label === "positive") {
    return "позитив";
  }
  if (label === "negative") {
    return "негатив";
  }
  return "нейтрально";
}
