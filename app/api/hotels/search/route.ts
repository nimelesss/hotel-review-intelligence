import { NextResponse } from "next/server";
import { HotelSearchResult } from "@/entities/types";
import {
  hydrateHotelCatalogFromRemoteSource,
  searchHotelCatalog,
  upsertHotelCatalog
} from "@/server/search/hotel-search-cache";
import { getRepository } from "@/server/repositories";
import { decodeEscapedUnicode, normalizeSearchText, normalizeWhitespace } from "@/shared/lib/text";

interface NominatimAddress {
  road?: string;
  pedestrian?: string;
  footway?: string;
  house_number?: string;
  house_name?: string;
  hotel?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  city_district?: string;
  county?: string;
  state_district?: string;
  state?: string;
  region?: string;
  country?: string;
}

interface NominatimItem {
  place_id: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  category?: string;
  addresstype?: string;
  importance?: number;
  address?: NominatimAddress;
}

const ALLOWED_TYPES = new Set([
  "hotel",
  "hostel",
  "guest_house",
  "motel",
  "apartment",
  "apartments",
  "resort"
]);

const HOTEL_KEYWORDS = [
  "отель",
  "гостиница",
  "мини-отель",
  "hotel",
  "hostel",
  "inn",
  "resort",
  "guest house"
];

const CHAIN_BRANDS = new Set([
  "marriott",
  "courtyard",
  "hilton",
  "radisson",
  "novotel",
  "ibis",
  "mercure",
  "hyatt",
  "holiday",
  "sheraton",
  "ritz",
  "accor"
]);

const CITY_ALIASES: Record<string, string[]> = {
  "ростов-на-дону": ["rostov-on-don", "rostov na donu"],
  "санкт-петербург": ["saint petersburg", "sankt petersburg", "st petersburg"],
  "нижний новгород": ["nizhny novgorod"],
  "екатеринбург": ["yekaterinburg", "ekaterinburg"],
  "челябинск": ["chelyabinsk"],
  "новосибирск": ["novosibirsk"],
  "волгоград": ["volgograd"],
  "владивосток": ["vladivostok"],
  "краснодар": ["krasnodar"],
  "калининград": ["kaliningrad"],
  "казань": ["kazan"],
  "сочи": ["sochi"],
  "москва": ["moscow"],
  "пермь": ["perm"],
  "самара": ["samara"],
  "уфа": ["ufa"]
};

const ADDRESS_ADMIN_WORDS = [
  "район",
  "область",
  "край",
  "округ",
  "республика",
  "municipality",
  "district",
  "county",
  "region"
];

const TOKEN_STOP_WORDS = new Set([
  "отель",
  "гостиница",
  "мини",
  "hotel",
  "hostel",
  "inn",
  "resort",
  "guest",
  "house",
  "россия",
  "russia"
]);

const MAX_PARALLEL_VARIANTS = 6;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeWhitespace(decodeEscapedUnicode(searchParams.get("q") || ""));
  const limit = clampLimit(searchParams.get("limit"));

  if (query.length < 2) {
    return NextResponse.json({ message: "Введите минимум 2 символа для поиска отеля." }, { status: 400 });
  }

  try {
    await hydrateHotelCatalogFromRemoteSource();

    const localSuggestions = searchHotelCatalog(query, Math.max(limit, 12));
    const existingHotels = getRepository().listHotels().map((hotel) => ({
      externalId: hotel.externalId || hotel.id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      address: hotel.address,
      coordinates: hotel.coordinates,
      source: "catalog_import" as const
    }));

    const queryTokens = tokenizeSearchQuery(query);
    const variants = buildQueryVariants(query).slice(0, MAX_PARALLEL_VARIANTS);

    const responses = await Promise.allSettled(
      variants.map((variant) => requestNominatim(variant, Math.max(32, limit * 6)))
    );

    const remoteItems = responses
      .filter((result): result is PromiseFulfilledResult<NominatimItem[]> => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .filter((item) => isHotelEntity(item, queryTokens, query))
      .map(mapNominatimToHotelSearchResult)
      .filter((item): item is HotelSearchResult => !!item.name && !!item.city)
      .filter((item) => !isBrandOnlyResult(item, query));

    if (remoteItems.length) {
      upsertHotelCatalog(remoteItems);
    }

    const merged = rankAndLimitResults(
      [...existingHotels, ...localSuggestions, ...remoteItems],
      query,
      limit
    );

    return NextResponse.json({ items: merged });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Не удалось выполнить поиск отелей."
      },
      { status: 500 }
    );
  }
}

async function requestNominatim(query: string, limit: number): Promise<NominatimItem[]> {
  const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
  nominatimUrl.searchParams.set("q", query);
  nominatimUrl.searchParams.set("format", "jsonv2");
  nominatimUrl.searchParams.set("addressdetails", "1");
  nominatimUrl.searchParams.set("countrycodes", "ru");
  nominatimUrl.searchParams.set("limit", String(limit));
  nominatimUrl.searchParams.set("accept-language", "ru");

  const response = await fetch(nominatimUrl.toString(), {
    headers: {
      "User-Agent": "hotel-review-intelligence/1.0 (contact: product@local)"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Ошибка геопоиска: HTTP ${response.status}`);
  }

  return (await response.json()) as NominatimItem[];
}

function buildQueryVariants(input: string): string[] {
  const query = normalizeWhitespace(input);
  const normalized = normalize(query);
  const variants = new Set<string>();

  variants.add(query);

  const hasHotelWord = HOTEL_KEYWORDS.some((keyword) => normalized.includes(keyword));
  if (!hasHotelWord) {
    variants.add(`отель ${query}`);
    variants.add(`${query} отель`);
    variants.add(`hotel ${query}`);
    variants.add(`${query} hotel`);
  }

  const noDash = query.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (noDash !== query) {
    variants.add(noDash);
  }

  expandCityAliases(query).forEach((variant) => variants.add(variant));

  return [...variants];
}

function expandCityAliases(query: string): string[] {
  const normalized = normalize(query);
  const results = new Set<string>();

  Object.entries(CITY_ALIASES).forEach(([cityRu, aliases]) => {
    if (normalized.includes(cityRu)) {
      aliases.forEach((alias) => {
        const replaced = replaceInsensitive(query, cityRu, alias);
        if (replaced) {
          results.add(replaced);
        }
      });
    }

    aliases.forEach((alias) => {
      if (normalized.includes(alias)) {
        const replaced = replaceInsensitive(query, alias, cityRu);
        if (replaced) {
          results.add(replaced);
        }
      }
    });
  });

  return [...results];
}

function replaceInsensitive(input: string, needle: string, replacement: string): string {
  const pattern = new RegExp(escapeRegExp(needle), "i");
  return input.replace(pattern, replacement);
}

function isHotelEntity(item: NominatimItem, queryTokens: string[], rawQuery: string): boolean {
  const city = extractCity(item);
  if (!city || !queryTokens.length) {
    return false;
  }

  const isTourismHotel =
    (item.class === "tourism" || item.category === "tourism") &&
    !!item.type &&
    ALLOWED_TYPES.has(item.type);

  const haystack = normalize(`${item.name || ""} ${item.display_name || ""}`);
  const hasHotelKeyword = HOTEL_KEYWORDS.some((keyword) => haystack.includes(keyword));
  if (!isTourismHotel && !hasHotelKeyword) {
    return false;
  }

  const nameHaystack = normalize(item.name || "");
  const fullHaystack = normalize(`${item.name || ""} ${item.display_name || ""}`);

  const nameHits = queryTokens.filter((token) => nameHaystack.includes(token)).length;
  if (nameHits > 0) {
    return true;
  }

  const fullHits = queryTokens.filter((token) => fullHaystack.includes(token)).length;
  if (queryTokens.length === 1) {
    return false;
  }

  if (fullHits >= Math.ceil(queryTokens.length * 0.6)) {
    return true;
  }

  const normalizedQuery = normalize(rawQuery);
  return normalizedQuery.length >= 4 && fullHaystack.includes(normalizedQuery);
}

function isBrandOnlyResult(item: HotelSearchResult, query: string): boolean {
  const normalizedName = normalize(item.name);
  const tokens = normalizedName.split(" ").filter(Boolean);
  if (!tokens.length) {
    return true;
  }

  const hasHotelWord = HOTEL_KEYWORDS.some((keyword) => normalizedName.includes(keyword));
  if (hasHotelWord) {
    return false;
  }

  if (tokens.length === 1 && CHAIN_BRANDS.has(tokens[0])) {
    return true;
  }

  const queryTokens = tokenizeSearchQuery(query);
  const queryHasCityToken = queryTokens.some(
    (token) => token.length > 2 && normalize(item.city).includes(token)
  );

  if (!queryHasCityToken && tokens.length <= 2 && tokens.some((token) => CHAIN_BRANDS.has(token))) {
    return true;
  }

  return false;
}

function rankAndLimitResults(items: HotelSearchResult[], query: string, limit: number): HotelSearchResult[] {
  const bestByKey = new Map<string, { item: HotelSearchResult; score: number }>();

  for (const item of items) {
    const score = scoreResult(item, query);
    if (score <= 0) {
      continue;
    }
    const key = buildResultDedupKey(item);
    const existing = bestByKey.get(key);
    if (!existing || score > existing.score) {
      bestByKey.set(key, { item, score });
    }
  }

  return [...bestByKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function scoreResult(item: HotelSearchResult, query: string): number {
  const normalizedQuery = normalize(query);
  const name = normalize(item.name);
  const city = normalize(item.city);
  const address = normalize(item.address);
  const queryTokens = tokenizeSearchQuery(normalizedQuery);

  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;

  if (name === normalizedQuery) {
    score += 140;
  }
  if (name.startsWith(normalizedQuery)) {
    score += 95;
  }
  if (name.includes(normalizedQuery)) {
    score += 65;
  }

  for (const token of queryTokens) {
    if (name.includes(token)) {
      score += 24;
    }
    if (city.includes(token)) {
      score += 9;
    }
    if (address.includes(token)) {
      score += 4;
    }
  }

  if (queryTokens.length > 1 && queryTokens.every((token) => name.includes(token))) {
    score += 30;
  }

  if (item.source === "catalog_import") {
    score += 4;
  }

  return score;
}

function mapNominatimToHotelSearchResult(item: NominatimItem): HotelSearchResult {
  const city = extractCity(item) || "Не указан";
  const displayName = decodeEscapedUnicode(item.display_name || "");
  const normalizedName = normalizeHotelName(decodeEscapedUnicode(item.name || displayName), city);
  const country = decodeEscapedUnicode(item.address?.country || "Россия");
  const address = buildCompactAddress(item, normalizedName, city, country, displayName);

  return {
    externalId: String(item.place_id),
    name: normalizedName,
    city,
    country,
    address,
    coordinates:
      item.lat && item.lon
        ? {
            lat: Number(item.lat),
            lon: Number(item.lon)
          }
        : undefined,
    source: "osm_nominatim"
  };
}

function normalizeHotelName(value: string, city: string): string {
  const chunks = value
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  const cityNormalized = normalize(city);
  const best = chunks.find((part) => normalize(part) !== cityNormalized) || chunks[0] || value.trim();
  return best || "Неизвестный отель";
}

function extractCity(item: NominatimItem): string {
  return normalizeWhitespace(
    decodeEscapedUnicode(
      item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.address?.municipality ||
        item.address?.state_district ||
        item.address?.state ||
        ""
    )
  );
}

function buildCompactAddress(
  item: NominatimItem,
  name: string,
  city: string,
  country: string,
  displayName: string
): string {
  const roadRaw = decodeEscapedUnicode(
    item.address?.road ||
      item.address?.pedestrian ||
      item.address?.footway ||
      item.address?.house_name ||
      item.address?.hotel ||
      ""
  );
  const houseRaw = decodeEscapedUnicode(item.address?.house_number || "");
  const street = normalizeWhitespace([roadRaw, houseRaw].filter(Boolean).join(", "));

  if (street) {
    return [street, city, country].filter(Boolean).join(", ");
  }

  const fallback = simplifyAddress(displayName, city, country);
  if (fallback) {
    return fallback;
  }

  return `${name}, ${city}`;
}

function simplifyAddress(address: string, city?: string, country?: string): string {
  if (!address) {
    return "";
  }

  const cityKey = city ? normalize(city) : "";
  const countryKey = country ? normalize(country) : "";

  const cleaned = address
    .split(",")
    .map((part) => normalizeWhitespace(decodeEscapedUnicode(part)))
    .filter(Boolean)
    .filter((part) => {
      const normalized = normalize(part);
      return !ADDRESS_ADMIN_WORDS.some((word) => normalized.includes(word));
    });

  const deduped = dedupeStringList(cleaned);
  const result = deduped.slice(0, 3);

  if (city && !result.some((part) => normalize(part) === cityKey)) {
    result.push(city);
  }
  if (country && !result.some((part) => normalize(part) === countryKey)) {
    result.push(country);
  }

  return dedupeStringList(result).slice(0, 3).join(", ");
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const key = normalize(value);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(value);
  });

  return result;
}

function buildResultDedupKey(item: HotelSearchResult): string {
  const normalizedName = normalize(stripCitySuffix(item.name, item.city));
  const normalizedCity = normalize(item.city);
  const normalizedAddress = normalize(simplifyAddress(item.address, item.city, item.country));

  if (!normalizedAddress) {
    return `${normalizedName}|${normalizedCity}`;
  }

  return `${normalizedName}|${normalizedCity}|${normalizedAddress}`;
}

function stripCitySuffix(name: string, city: string): string {
  const normalizedName = normalizeWhitespace(name);
  const normalizedCity = normalizeWhitespace(city);
  if (!normalizedName || !normalizedCity) {
    return normalizedName;
  }

  const pattern = new RegExp(`(?:,|\\-|\\s)+${escapeRegExp(normalizedCity)}$`, "i");
  return normalizedName.replace(pattern, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeSearchQuery(query: string): string[] {
  return normalize(query)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !TOKEN_STOP_WORDS.has(token));
}

function normalize(value: string): string {
  return normalizeSearchText(value);
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.min(16, Math.max(4, Math.floor(parsed)));
}
