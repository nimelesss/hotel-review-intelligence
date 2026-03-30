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

const ACCOMMODATION_GENERIC_TOKENS = new Set([
  "\u043e\u0442\u0435\u043b\u044c",
  "\u0433\u043e\u0441\u0442\u0438\u043d\u0438\u0446\u0430",
  "\u0433\u043e\u0441\u0442\u0435\u0432\u043e\u0439",
  "\u0434\u043e\u043c",
  "\u0430\u043f\u0430\u0440\u0442-\u043e\u0442\u0435\u043b\u044c",
  "\u0430\u043f\u0430\u0440\u0442\u043e\u0442\u0435\u043b\u044c",
  "\u0430\u043f\u0430\u0440\u0442",
  "hotel",
  "hostel",
  "inn"
]);

export function stripAccommodationWords(input: string): string {
  const normalized = normalizeSearchText(input);
  if (!normalized) {
    return "";
  }

  const stripped = normalized
    .split(" ")
    .filter((token) => token && !ACCOMMODATION_GENERIC_TOKENS.has(token))
    .join(" ");

  return normalizeWhitespace(stripped || normalized);
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
