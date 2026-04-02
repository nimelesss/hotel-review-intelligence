import { SentimentLabel } from "@/entities/types";
import {
  NEGATIVE_SENTIMENT_MARKERS,
  POSITIVE_SENTIMENT_MARKERS
} from "@/server/analytics/lexicons/sentiment.lexicon";
import { INTENSIFIERS, NEGATIONS, NEGATION_WINDOW } from "@/server/analytics/lexicons/modifiers.lexicon";
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

/**
 * Rating signal weight.
 * Previous: 1.2 (dominated text analysis).
 * New: 0.35 (mild hint, text speaks louder).
 */
const RATING_SIGNAL_WEIGHT = 0.35;

/**
 * Normalizer: divide raw score by this to get [-1, 1] range.
 * Tuned for expanded lexicon (~100 pos + ~80 neg markers).
 */
const SCORE_NORMALIZER = 8;

export function scoreSentiment(input: SentimentScoringInput): SentimentScoringResult {
  let score = 0;
  const evidence: string[] = [];

  input.tokens.forEach((token, index) => {
    const positive = matchWeighted(token, POSITIVE_SENTIMENT_MARKERS);
    const negative = matchWeighted(token, NEGATIVE_SENTIMENT_MARKERS);
    const modifier = getModifier(input.tokens, index);

    if (positive > 0) {
      const weighted = positive * modifier.factor * modifier.polarity;
      score += weighted;
      evidence.push(
        `${modifier.negated ? "↻ " : ""}+ ${token} (${weighted.toFixed(2)})`
      );
    }
    if (negative > 0) {
      const weighted = negative * modifier.factor * modifier.polarity;
      score -= weighted;
      evidence.push(
        `${modifier.negated ? "↻ " : ""}- ${token} (${weighted.toFixed(2)})`
      );
    }
  });

  // Rating as a mild hint, not the dominant signal
  const ratingSignal = clamp((input.rating - 5) / 5, -1, 1) * RATING_SIGNAL_WEIGHT;
  score += ratingSignal;
  evidence.push(`рейтинг ×${RATING_SIGNAL_WEIGHT} (${ratingSignal.toFixed(2)})`);

  const normalized = clamp(score / SCORE_NORMALIZER, -1, 1);
  return {
    label: toSentimentLabel(normalized),
    score: normalized,
    evidence: evidence.slice(0, 15)
  };
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

/**
 * Match token against lexicon using startsWith (stem matching).
 * Previous: includes() which was too broad ("нечистый" matched "чист").
 */
function matchWeighted(token: string, lexicon: Record<string, number>): number {
  const direct = lexicon[token];
  if (direct) {
    return direct;
  }

  // Multi-word keys: check if token sequence matches
  for (const [key, weight] of Object.entries(lexicon)) {
    if (key.includes(" ")) {
      continue; // multi-word handled by markers in preprocess
    }
    if (token.startsWith(key) && token.length <= key.length + 4) {
      return weight;
    }
  }
  return 0;
}

/**
 * Windowed negation + intensifier detection.
 * Checks NEGATION_WINDOW tokens before the current token.
 */
function getModifier(tokens: string[], index: number): {
  factor: number;
  polarity: number;
  negated: boolean;
} {
  const windowStart = Math.max(0, index - NEGATION_WINDOW);
  const neighborhood = tokens.slice(windowStart, index);

  // Check for negation in window
  const negated = neighborhood.some((token) =>
    NEGATIONS.some((negation) => {
      if (negation.includes(" ")) {
        // Multi-word negation: check consecutive tokens
        const parts = negation.split(" ");
        const tokenIdx = neighborhood.indexOf(token);
        return parts.every((part, pi) => {
          const checkToken = neighborhood[tokenIdx + pi];
          return checkToken === part;
        });
      }
      return token === negation;
    })
  );

  // Check for intensifier in immediate neighborhood (prev 2 tokens)
  const nearTokens = tokens.slice(Math.max(0, index - 2), index);
  const intensifier = nearTokens.find((token) => INTENSIFIERS[token]);

  return {
    factor: intensifier ? INTENSIFIERS[intensifier] : 1,
    polarity: negated ? -1 : 1,
    negated
  };
}
