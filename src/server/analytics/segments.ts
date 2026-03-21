import { SegmentId } from "@/entities/types";
import { SEGMENT_LABELS } from "@/shared/config/taxonomy";
import { clamp } from "@/shared/lib/format";
import { SEGMENT_MARKERS } from "@/server/analytics/rules/segment-markers";

export interface SegmentScoringInput {
  markers: string[];
  rating: number;
  stayTypeRaw?: string;
}

export interface SegmentScoringResult {
  segmentScores: Record<SegmentId, number>;
  primarySegment: SegmentId;
  confidence: number;
  matchedMarkers: string[];
  rationale: string;
}

const BASE_SEGMENT_IDS = Object.keys(SEGMENT_MARKERS) as Array<
  Exclude<SegmentId, "mixed" | "unclassified">
>;

export function scoreSegments(input: SegmentScoringInput): SegmentScoringResult {
  const markerSet = new Set(input.markers);
  const rawScores = BASE_SEGMENT_IDS.reduce<Record<SegmentId, number>>(
    (acc, segmentId) => {
      acc[segmentId] = 0;
      return acc;
    },
    {
      mixed: 0,
      unclassified: 0
    } as Record<SegmentId, number>
  );

  const matchedMarkers: string[] = [];

  BASE_SEGMENT_IDS.forEach((segmentId) => {
    Object.entries(SEGMENT_MARKERS[segmentId]).forEach(([marker, weight]) => {
      if (hasMarker(markerSet, marker)) {
        rawScores[segmentId] += weight;
        matchedMarkers.push(`${SEGMENT_LABELS[segmentId]}: ${marker}`);
      }
    });
  });

  if (input.stayTypeRaw) {
    const lowered = input.stayTypeRaw.toLocaleLowerCase("ru-RU");
    if (lowered.includes("business") || lowered.includes("командир")) {
      rawScores.business_traveler += 1.2;
    }
    if (lowered.includes("family") || lowered.includes("сем")) {
      rawScores.family += 1.2;
    }
    if (lowered.includes("couple") || lowered.includes("пара")) {
      rawScores.couple += 1;
    }
    if (lowered.includes("solo") || lowered.includes("один")) {
      rawScores.solo_traveler += 1.1;
    }
    if (lowered.includes("transit") || lowered.includes("транзит")) {
      rawScores.transit_guest += 1.1;
    }
  }

  const boostedScores = ratingBiasAdjust(rawScores, input.rating);
  const normalizedScores = normalizeScores(boostedScores);
  const ordered = BASE_SEGMENT_IDS
    .map((segmentId) => ({ segmentId, score: normalizedScores[segmentId] }))
    .sort((a, b) => b.score - a.score);

  const top = ordered[0];
  const second = ordered[1];
  let primarySegment: SegmentId = top?.segmentId ?? "unclassified";
  const confidenceGap = top ? top.score - (second?.score ?? 0) : 0;
  let confidence = clamp((top?.score ?? 0) + confidenceGap * 0.5, 0, 1);

  if (!top || top.score < 0.34) {
    primarySegment = "unclassified";
    confidence = clamp(top?.score ?? 0.2, 0.1, 0.5);
  } else if (confidenceGap < 0.12) {
    primarySegment = "mixed";
    confidence = clamp(top.score, 0.35, 0.62);
  }

  const finalScores = {
    ...normalizedScores,
    mixed: primarySegment === "mixed" ? confidence : 0,
    unclassified: primarySegment === "unclassified" ? 1 - confidence : 0
  };

  return {
    segmentScores: finalScores,
    primarySegment,
    confidence,
    matchedMarkers: unique(matchedMarkers).slice(0, 10),
    rationale: buildRationale(primarySegment, confidence, top?.score ?? 0, confidenceGap)
  };
}

function ratingBiasAdjust(scores: Record<SegmentId, number>, rating: number): Record<SegmentId, number> {
  const adjusted = { ...scores };
  const ratingNorm = clamp((rating - 3) / 2, -1, 1);

  adjusted.business_traveler += ratingNorm > 0 ? 0.15 : 0;
  adjusted.family += ratingNorm > 0 ? 0.1 : 0;
  adjusted.transit_guest += ratingNorm < 0 ? 0.08 : 0;
  adjusted.solo_traveler += 0.05;

  return adjusted;
}

function normalizeScores(scores: Record<SegmentId, number>): Record<SegmentId, number> {
  const total = BASE_SEGMENT_IDS.reduce((sum, segmentId) => sum + Math.max(scores[segmentId], 0), 0);
  const normalized = { ...scores };

  if (total <= 0) {
    BASE_SEGMENT_IDS.forEach((segmentId) => {
      normalized[segmentId] = 0;
    });
    return normalized;
  }

  BASE_SEGMENT_IDS.forEach((segmentId) => {
    normalized[segmentId] = clamp(scores[segmentId] / total, 0, 1);
  });
  return normalized;
}

function buildRationale(
  primarySegment: SegmentId,
  confidence: number,
  topScore: number,
  confidenceGap: number
): string {
  if (primarySegment === "unclassified") {
    return "Недостаточно маркеров для уверенной сегментации. Нужен больший контекст отзывов.";
  }
  if (primarySegment === "mixed") {
    return `Обнаружены конкурирующие сигналы сегментов (разрыв ${(
      confidenceGap * 100
    ).toFixed(1)} п.п.), поэтому профиль отмечен как смешанный.`;
  }
  return `Основной сегмент: ${SEGMENT_LABELS[primarySegment]}. Уверенность ${(
    confidence * 100
  ).toFixed(1)}%, относительный вес ${(topScore * 100).toFixed(1)}%.`;
}

function hasMarker(markerSet: Set<string>, marker: string): boolean {
  if (markerSet.has(marker)) {
    return true;
  }
  return [...markerSet].some((value) => value.includes(marker));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
