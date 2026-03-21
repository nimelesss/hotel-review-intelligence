import { NextResponse } from "next/server";
import { HotelSearchResult } from "@/entities/types";
import {
  hydrateHotelCatalogFromRemoteSource,
  searchHotelCatalog,
  upsertHotelCatalog
} from "@/server/search/hotel-search-cache";
import { getRepository } from "@/server/repositories";
import { decodeEscapedUnicode, normalizeSearchText, normalizeWhitespace } from "@/shared/lib/text";

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
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    country?: string;
  };
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

const MAX_PARALLEL_VARIANTS = 6;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeWhitespace(decodeEscapedUnicode(searchParams.get("q") || ""));
  const limit = clampLimit(searchParams.get("limit"));

  if (query.length < 2) {
    return NextResponse.json(
      { message: "Введите минимум 2 символа для поиска отеля." },
      { status: 400 }
    );
  }

  try {
    await hydrateHotelCatalogFromRemoteSource();

    const localSuggestions = searchHotelCatalog(query, Math.max(limit, 10));
    const existingHotels = getRepository().listHotels().map((hotel) => ({
      externalId: hotel.externalId || hotel.id,
      name: hotel.name,
      city: hotel.city,
      country: hotel.country,
      address: hotel.address,
      coordinates: hotel.coordinates,
      source: "catalog_import" as const
    }));

    const variants = buildQueryVariants(query).slice(0, MAX_PARALLEL_VARIANTS);
    const responses = await Promise.allSettled(
      variants.map((variant) => requestNominatim(variant, Math.max(30, limit * 5)))
    );

    const remoteItems = responses
      .filter((result): result is PromiseFulfilledResult<NominatimItem[]> => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .filter((item) => isHotelEntity(item, query))
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
          error instanceof Error
            ? error.message
            : "Не удалось выполнить поиск отелей."
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

  const compact = query.replace(/\s+/g, " ").trim();
  if (compact !== query) {
    variants.add(compact);
  }

  const noDash = query.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (noDash !== query) {
    variants.add(noDash);
  }

  const cityAliasVariants = expandCityAliases(query);
  cityAliasVariants.forEach((variant) => variants.add(variant));

  return [...variants];
}

function expandCityAliases(query: string): string[] {
  const normalized = normalize(query);
  const results = new Set<string>();

  Object.entries(CITY_ALIASES).forEach(([cityRu, aliases]) => {
    if (normalized.includes(cityRu)) {
      aliases.forEach((alias) => {
        results.add(query.replace(new RegExp(cityRu, "i"), alias));
      });
    }

    aliases.forEach((alias) => {
      if (normalized.includes(alias)) {
        results.add(query.replace(new RegExp(alias, "i"), cityRu));
      }
    });
  });

  return [...results];
}

function isHotelEntity(item: NominatimItem, query: string): boolean {
  const city = extractCity(item);
  if (!city) {
    return false;
  }

  if (
    (item.class === "tourism" || item.category === "tourism") &&
    item.type &&
    ALLOWED_TYPES.has(item.type)
  ) {
    return true;
  }

  const haystack = normalize(`${item.name || ""} ${item.display_name || ""}`);
  if (HOTEL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return true;
  }

  const queryTokens = normalize(query)
    .split(" ")
    .filter((token) => token.length >= 3);

  if (!queryTokens.length) {
    return false;
  }

  const matched = queryTokens.filter((token) => haystack.includes(token)).length;
  return matched >= Math.min(2, queryTokens.length);
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

  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const queryHasCityToken = queryTokens.some(
    (token) => token.length > 3 && normalize(item.city).includes(token)
  );

  if (!queryHasCityToken && tokens.length <= 2 && tokens.some((token) => CHAIN_BRANDS.has(token))) {
    return true;
  }

  return false;
}

function rankAndLimitResults(
  items: HotelSearchResult[],
  query: string,
  limit: number
): HotelSearchResult[] {
  const unique = new Map<string, HotelSearchResult>();

  for (const item of items) {
    const key =
      item.externalId ||
      `${normalize(item.name)}|${normalize(item.city)}|${normalize(item.address)}`;
    unique.set(key, item);
  }

  return [...unique.values()]
    .map((item) => ({
      item,
      score: scoreResult(item, query)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function scoreResult(item: HotelSearchResult, query: string): number {
  const normalizedQuery = normalize(query);
  const name = normalize(item.name);
  const city = normalize(item.city);
  const address = normalize(item.address);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  let score = 0;

  if (name === normalizedQuery) {
    score += 120;
  }
  if (name.startsWith(normalizedQuery)) {
    score += 80;
  }
  if (name.includes(normalizedQuery)) {
    score += 50;
  }
  if (city.includes(normalizedQuery)) {
    score += 25;
  }

  for (const token of queryTokens) {
    if (name.includes(token)) {
      score += 18;
    }
    if (city.includes(token)) {
      score += 12;
    }
    if (address.includes(token)) {
      score += 6;
    }
  }

  return score;
}

function mapNominatimToHotelSearchResult(item: NominatimItem): HotelSearchResult {
  const city = extractCity(item) || "Не указан";
  const displayName = decodeEscapedUnicode(item.display_name || "");
  const normalizedName = normalizeHotelName(decodeEscapedUnicode(item.name || displayName));

  return {
    externalId: String(item.place_id),
    name: normalizedName,
    city,
    country: decodeEscapedUnicode(item.address?.country || "Россия"),
    address: displayName || `${normalizedName}, ${city}`,
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

function normalizeHotelName(value: string): string {
  const candidate = value.split(",")[0]?.trim();
  if (!candidate) {
    return value.trim() || "Неизвестный отель";
  }
  return normalizeWhitespace(candidate);
}

function extractCity(item: NominatimItem): string {
  return normalizeWhitespace(
    decodeEscapedUnicode(
      item.address?.city ||
        item.address?.town ||
        item.address?.village ||
        item.address?.municipality ||
        item.address?.state ||
        ""
    )
  );
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
