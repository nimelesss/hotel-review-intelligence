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
  const queryVariants = buildQueryVariants(query);

  const withReviews = scoreRepositoryHotels(
    hotels.filter((hotel) => (hotel.reviewCount ?? 0) > 0),
    queryVariants
  );

  let entries = dedupeScoredEntries(withReviews);

  if (!entries.length) {
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

    entries = dedupeScoredEntries([...entries, ...cacheEntries]);
  }

  const items = entries
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);

  return NextResponse.json({ items });
}

function scoreRepositoryHotels(
  hotels: Array<{
    id: string;
    name: string;
    city: string;
    country: string;
    address: string;
    coordinates?: {
      lat: number;
      lon: number;
    };
  }>,
  queryVariants: string[]
): ScoredSearchEntry[] {
  return hotels
    .map((hotel) => {
      const item: HotelSearchResult = {
        externalId: hotel.id,
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        address: hotel.address,
        coordinates: hotel.coordinates,
        source: "catalog_import"
      };

      return {
        item,
        score: scoreCatalogItem(item, queryVariants)
      };
    })
    .filter((entry) => entry.score > 0);
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
  const name = normalize(hotel.name);
  const city = normalize(hotel.city);
  const address = normalize(hotel.address);
  const tokens = q.split(" ").filter(Boolean);

  if (!q) {
    return 0;
  }

  let score = 0;
  if (name === q) score += 160;
  if (name.startsWith(q)) score += 120;
  if (name.includes(q)) score += 70;
  if (city.includes(q)) score += 30;
  if (address.includes(q)) score += 18;

  for (const token of tokens) {
    if (token.length < 2) {
      continue;
    }
    if (name.includes(token)) score += 24;
    if (city.includes(token)) score += 12;
    if (address.includes(token)) score += 6;
  }

  if (tokens.length > 1 && tokens.every((token) => name.includes(token) || city.includes(token))) {
    score += 35;
  }

  return score;
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
    .replace(/корт[ья]рд/gi, "courtyard")
    .replace(/марри?отт/gi, "marriott")
    .replace(/хилтон/gi, "hilton")
    .replace(/хаятт/gi, "hyatt")
    .replace(/маринс/gi, "marins");
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
