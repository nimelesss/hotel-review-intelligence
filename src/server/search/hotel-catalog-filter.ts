import { normalizeSearchText } from "@/shared/lib/text";

const PLATFORM_TOKENS = [
  "sutochno",
  "суточно",
  "ostrovok",
  "booking",
  "tripadvisor",
  "2gis",
  "2гис",
  "yandex",
  "яндекс",
  "bronevik",
  "avito",
  "авито",
  "flamp"
];

const ACCOMMODATION_HINTS = [
  "отель",
  "гостиница",
  "hotel",
  "hostel",
  "resort",
  "inn",
  "апарт",
  "санатор",
  "база отдыха"
];

export function isSearchableHotelName(name: string): boolean {
  const normalized = normalizeSearchText(name || "");
  if (!normalized || normalized.length < 2) {
    return false;
  }

  if (normalized === "отель" || normalized === "гостиница") {
    return false;
  }

  if (
    PLATFORM_TOKENS.some(
      (token) =>
        normalized === token ||
        normalized.startsWith(`${token} `) ||
        normalized.endsWith(` ${token}`) ||
        normalized.includes(` ${token} `)
    )
  ) {
    return false;
  }

  if (/^[a-z0-9-]+\sru$/i.test(normalized) && !containsAccommodationHint(normalized)) {
    return false;
  }

  return true;
}

function containsAccommodationHint(value: string): boolean {
  return ACCOMMODATION_HINTS.some((hint) => value.includes(hint));
}
