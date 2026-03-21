export function decodeEscapedUnicode(input: string): string {
  let value = input;

  for (let i = 0; i < 3; i += 1) {
    const next = decodeOnePass(value);
    if (next === value) {
      break;
    }
    value = next;
  }

  return value;
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function toLowerSafe(input: string): string {
  return normalizeWhitespace(input)
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435");
}

export function tokenize(input: string): string[] {
  if (!input) {
    return [];
  }

  return toLowerSafe(input)
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 1);
}

export function normalizeSearchText(input: string): string {
  return normalizeWhitespace(
    decodeEscapedUnicode(input)
      .toLocaleLowerCase("ru-RU")
      .replace(/\u0451/g, "\u0435")
      .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
  );
}

function decodeOnePass(input: string): string {
  if (!input.includes("\\u") && !input.includes("\\x")) {
    return input;
  }

  const unicodeDecoded = input.replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))
  );
  const hexDecoded = unicodeDecoded.replace(
    /\\x([0-9a-fA-F]{2})/g,
    (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))
  );

  return hexDecoded;
}
