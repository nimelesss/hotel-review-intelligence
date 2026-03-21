export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function toLowerSafe(value: string): string {
  return value.toLocaleLowerCase("ru-RU");
}

export function tokenize(value: string): string[] {
  return value
    .split(/[^a-zA-Zа-яА-ЯёЁ0-9-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}
