import { SentimentLabel } from "@/entities/types";
import {
  NEGATIVE_SENTIMENT_MARKERS,
  POSITIVE_SENTIMENT_MARKERS
} from "@/server/analytics/lexicons/sentiment.lexicon";
import {
  INTENSIFIERS,
  NEGATIONS
} from "@/server/analytics/lexicons/modifiers.lexicon";
import { clamp } from "@/shared/lib/format";

export interface SentimentScoringInput {
  markers: string[];
  tokens: string[];
  rating: number;
}

export interface SentimentScoringResult {
  label: SentimentLabel;
  score: number;
  evidence: string[];
}

export function scoreSentiment(input: SentimentScoringInput): SentimentScoringResult {
  let score = 0;
  const evidence: string[] = [];
  const tokenSet = new Set(input.tokens);

  input.tokens.forEach((token, index) => {
    const positive = matchWeighted(token, POSITIVE_SENTIMENT_MARKERS);
    const negative = matchWeighted(token, NEGATIVE_SENTIMENT_MARKERS);
    const modifier = getModifier(input.tokens, index);

    if (positive > 0) {
      const weighted = positive * modifier.factor * modifier.polarity;
      score += weighted;
      evidence.push(
        `${modifier.negated ? "negated " : ""}+ ${token} (${weighted.toFixed(
          2
        )})`
      );
    }
    if (negative > 0) {
      const weighted = negative * modifier.factor * modifier.polarity;
      score -= weighted;
      evidence.push(
        `${modifier.negated ? "negated " : ""}- ${token} (${weighted.toFixed(
          2
        )})`
      );
    }
  });

  const ratingSignal = clamp((input.rating - 3) / 2, -1, 1) * 1.2;
  score += ratingSignal;
  evidence.push(`rating signal (${ratingSignal.toFixed(2)})`);

  if (tokenSet.has("но")) {
    score *= 0.9;
  }

  const normalized = clamp(score / 6, -1, 1);
  return {
    label: toSentimentLabel(normalized),
    score: normalized,
    evidence: evidence.slice(0, 10)
  };
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

function matchWeighted(
  token: string,
  lexicon: Record<string, number>
): number {
  const direct = lexicon[token];
  if (direct) {
    return direct;
  }
  const fuzzyEntry = Object.entries(lexicon).find(([key]) => token.includes(key));
  return fuzzyEntry ? fuzzyEntry[1] : 0;
}

function getModifier(tokens: string[], index: number): {
  factor: number;
  polarity: number;
  negated: boolean;
} {
  const prev = tokens[index - 1];
  const prev2 = tokens[index - 2];
  const neighborhood = [prev, prev2].filter(Boolean) as string[];

  const negated = neighborhood.some((token) =>
    NEGATIONS.some((negation) => token === negation || token.includes(negation))
  );
  const intensifier = neighborhood.find((token) => INTENSIFIERS[token]);

  return {
    factor: intensifier ? INTENSIFIERS[intensifier] : 1,
    polarity: negated ? -1 : 1,
    negated
  };
}
