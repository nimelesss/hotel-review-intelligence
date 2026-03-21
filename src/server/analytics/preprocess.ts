import { normalizeWhitespace, toLowerSafe, tokenize } from "@/shared/lib/text";

export interface PreprocessResult {
  originalText: string;
  cleanedText: string;
  loweredText: string;
  tokens: string[];
  markers: string[];
}

const SERVICE_NOISE_PATTERNS = [
  /https?:\/\/\S+/gi,
  /www\.\S+/gi,
  /\[[^\]]+\]/g,
  /\{[^}]+\}/g,
  /#+/g,
  /_+/g
];

const FILLER_PATTERNS = [/[\u200B-\u200D\uFEFF]/g, /[\r\n\t]+/g];

export function preprocessReviewText(text: string): PreprocessResult {
  const originalText = text ?? "";
  let cleaned = originalText;

  for (const pattern of SERVICE_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  for (const pattern of FILLER_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  cleaned = normalizeWhitespace(cleaned);
  const loweredText = toLowerSafe(cleaned);
  const tokens = tokenize(loweredText);
  const markers = buildMarkers(tokens);

  return {
    originalText,
    cleanedText: cleaned,
    loweredText,
    tokens,
    markers
  };
}

function buildMarkers(tokens: string[]): string[] {
  const markerSet = new Set<string>();

  tokens.forEach((token, index) => {
    markerSet.add(token);
    if (index < tokens.length - 1) {
      markerSet.add(`${token} ${tokens[index + 1]}`);
    }
  });

  return [...markerSet];
}
