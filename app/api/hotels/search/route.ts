import { NextResponse } from "next/server";
import { HotelSearchResult } from "@/entities/types";
import { getRepository } from "@/server/repositories";
import {
  hydrateHotelCatalogFromRemoteSource,
  searchHotelCatalog
} from "@/server/search/hotel-search-cache";
import { normalizeSearchText, normalizeWhitespace } from "@/shared/lib/text";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = normalizeWhitespace(searchParams.get("q") || "");
  const limit = clampLimit(searchParams.get("limit"));

  if (query.length < 2) {
    return NextResponse.json(
      { message: "Введите минимум 2 символа для поиска отеля." },
      { status: 400 }
    );
  }

  const repository = getRepository();
  const hotels = repository.listHotels();
  const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
  const hotelsByExternalId = new Map(
    hotels
      .filter((hotel) => !!hotel.externalId)
      .map((hotel) => [normalize(hotel.externalId || ""), hotel])
  );
  const queryVariants = buildQueryVariants(query);

  const reviewedHotels = hotels.filter((hotel) => (hotel.reviewCount ?? 0) > 0);
  const reviewedByNameCity = indexHotelsByNameCity(reviewedHotels);
  const withReviews = scoreRepositoryHotels(reviewedHotels, queryVariants);

  let entries = dedupeScoredEntries(withReviews);

  if (!entries.length && !reviewedHotels.length) {
    const withoutReviewFilter = scoreRepositoryHotels(hotels, queryVariants);
    entries = dedupeScoredEntries(withoutReviewFilter);
  }

  if (entries.length < limit) {
    await hydrateHotelCatalogFromRemoteSource();

    const cacheEntries = queryVariants.flatMap((variant) =>
      searchHotelCatalog(variant, Math.max(limit * 2, 20)).map((item) => ({
        item,
        score: scoreCatalogItem(item, queryVariants)
      }))
    );

    const mappedCacheEntries = cacheEntries
      .map((entry) => {
        const localHotel = resolveReviewedHotelForCatalogItem(
          entry.item,
          hotelsById,
          hotelsByExternalId,
          reviewedByNameCity
        );
        if (!localHotel) {
          return null;
        }
        const localItem = mapHotelToSearchItem(localHotel);
        return {
          item: localItem,
          score: Math.max(entry.score, scoreCatalogItem(localItem, queryVariants))
        } satisfies ScoredSearchEntry;
      })
      .filter((entry): entry is ScoredSearchEntry => !!entry);

    entries = dedupeScoredEntries([...entries, ...mappedCacheEntries]);
  }

  const items = entries
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);

  return NextResponse.json({ items });
}

function scoreRepositoryHotels(
  hotels: LocalHotel[],
  queryVariants: string[]
): ScoredSearchEntry[] {
  return hotels
    .map((hotel) => {
      const item = mapHotelToSearchItem(hotel);

      return {
        item,
        score: scoreCatalogItem(item, queryVariants)
      };
    })
    .filter((entry) => entry.score > 0);
}

function indexHotelsByNameCity(hotels: LocalHotel[]): Map<string, LocalHotel[]> {
  const index = new Map<string, LocalHotel[]>();
  hotels.forEach((hotel) => {
    const key = makeHotelNameCityKey(hotel.name, hotel.city);
    const bucket = index.get(key) || [];
    bucket.push(hotel);
    index.set(key, bucket);
  });
  return index;
}

function resolveReviewedHotelForCatalogItem(
  item: HotelSearchResult,
  hotelsById: Map<string, LocalHotel>,
  hotelsByExternalId: Map<string, LocalHotel>,
  reviewedByNameCity: Map<string, LocalHotel[]>
): LocalHotel | null {
  const byId = hotelsById.get(item.externalId);
  if ((byId?.reviewCount ?? 0) > 0) {
    return byId ?? null;
  }

  const byExternal = hotelsByExternalId.get(normalize(item.externalId || ""));
  if ((byExternal?.reviewCount ?? 0) > 0) {
    return byExternal ?? null;
  }

  const matches = reviewedByNameCity.get(makeHotelNameCityKey(item.name, item.city)) || [];
  const best = matches
    .slice()
    .sort(
    (a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0)
  )[0];
  return best || null;
}

function makeHotelNameCityKey(name: string, city: string): string {
  return `${normalize(name)}|${normalize(city)}`;
}

function mapHotelToSearchItem(hotel: LocalHotel): HotelSearchResult {
  return {
    externalId: hotel.id,
    name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    address: hotel.address,
    coordinates: hotel.coordinates,
    source: "catalog_import"
  };
}

function scoreCatalogItem(
  item: {
    name: string;
    city: string;
    address: string;
  },
  queryVariants: string[]
): number {
  let maxScore = 0;
  queryVariants.forEach((variant) => {
    maxScore = Math.max(maxScore, scoreBySingleQuery(item, variant));
  });
  return maxScore;
}

function scoreBySingleQuery(
  hotel: {
    name: string;
    city: string;
    address: string;
  },
  query: string
): number {
  const q = normalize(query);
  const nameVariants = buildTextVariants(hotel.name);
  const cityVariants = buildTextVariants(hotel.city);
  const addressVariants = buildTextVariants(hotel.address);
  const tokens = q.split(" ").filter(Boolean);

  if (!q) {
    return 0;
  }

  let score = 0;
  if (matchesExactly(nameVariants, q)) score += 160;
  if (matchesStartsWith(nameVariants, q)) score += 120;
  if (matchesIncludes(nameVariants, q)) score += 70;
  if (matchesIncludes(cityVariants, q)) score += 30;
  if (matchesIncludes(addressVariants, q)) score += 18;

  for (const token of tokens) {
    if (token.length < 2) {
      continue;
    }
    if (matchesIncludes(nameVariants, token)) score += 24;
    if (matchesIncludes(cityVariants, token)) score += 12;
    if (matchesIncludes(addressVariants, token)) score += 6;
  }

  if (
    tokens.length > 1 &&
    tokens.every(
      (token) => matchesIncludes(nameVariants, token) || matchesIncludes(cityVariants, token)
    )
  ) {
    score += 35;
  }

  return score;
}

function buildTextVariants(value: string): string[] {
  const normalized = normalize(value);
  const variants = [
    normalized,
    normalize(replaceBrandAliases(normalized)),
    normalize(transliterateCyrillicToLatin(normalized)),
    normalize(replaceBrandAliases(transliterateCyrillicToLatin(normalized)))
  ].filter((item) => item.length > 0);

  return [...new Set(variants)];
}

function matchesExactly(variants: string[], query: string): boolean {
  return variants.some((variant) => variant === query);
}

function matchesStartsWith(variants: string[], query: string): boolean {
  return variants.some((variant) => variant.startsWith(query));
}

function matchesIncludes(variants: string[], query: string): boolean {
  return variants.some((variant) => variant.includes(query));
}

function buildQueryVariants(query: string): string[] {
  const normalized = normalizeWhitespace(query);
  const variants = [
    normalized,
    replaceBrandAliases(normalized),
    transliterateCyrillicToLatin(normalized),
    replaceBrandAliases(transliterateCyrillicToLatin(normalized))
  ]
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item.length >= 2);

  return [...new Set(variants)];
}

function replaceBrandAliases(query: string): string {
  return query
    .replace(/\u043a\u043e\u0440\u0442[\u044a\u044c]?\u044f\u0440\u0434/giu, "courtyard")
    .replace(/\u043c\u0430\u0440\u0440\u0438?\u043e\u0442\u0442/giu, "marriott")
    .replace(/\u0445\u0438\u043b\u0442\u043e\u043d/giu, "hilton")
    .replace(/\u0445\u0430\u044f\u0442\u0442/giu, "hyatt")
    .replace(/\u043c\u0430\u0440\u0438\u043d\u0441/giu, "marins");
}

function transliterateCyrillicToLatin(value: string): string {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ъ: "",
    ы: "y",
    ь: "",
    э: "e",
    ю: "yu",
    я: "ya"
  };

  return [...value].map((char) => map[char.toLocaleLowerCase("ru-RU")] ?? char).join("");
}

function dedupeScoredEntries(entries: ScoredSearchEntry[]): ScoredSearchEntry[] {
  const bestByKey = new Map<string, ScoredSearchEntry>();

  entries.forEach((entry) => {
    const key = makeResultKey(entry.item);
    const current = bestByKey.get(key);
    if (!current || entry.score > current.score) {
      bestByKey.set(key, entry);
    }
  });

  return [...bestByKey.values()];
}

function makeResultKey(item: HotelSearchResult): string {
  return [
    normalize(item.externalId || ""),
    normalize(item.name || ""),
    normalize(item.city || ""),
    normalize(item.address || "")
  ].join("|");
}

interface ScoredSearchEntry {
  item: HotelSearchResult;
  score: number;
}

interface LocalHotel {
  id: string;
  externalId?: string;
  name: string;
  city: string;
  country: string;
  address: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
  reviewCount?: number;
}

function normalize(value: string): string {
  return normalizeSearchText(value || "");
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 10;
  }
  return Math.min(30, Math.max(5, Math.floor(parsed)));
}
