import { NextResponse } from "next/server";
import { HotelSearchResult } from "@/entities/types";
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

  const queryVariants = buildQueryVariants(query);
  const lookupLimit = Math.max(limit * 3, 30);

  const cacheEntries = queryVariants.flatMap((variant) =>
    searchHotelCatalog(variant, lookupLimit).map((item) => ({
      item,
      score: scoreCatalogItem(item, queryVariants)
    }))
  );

  const entries = dedupeScoredEntries(cacheEntries);

  if (entries.length < limit) {
    // Do not block search by remote catalog hydration.
    void hydrateHotelCatalogFromRemoteSource();
  }

  const items = entries
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);

  return NextResponse.json({ items });
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
    normalize(replaceLatinBrandAliases(normalized))
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
    replaceLatinBrandAliases(normalized),
    replaceLatinBrandAliases(replaceBrandAliases(normalized))
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

function replaceLatinBrandAliases(query: string): string {
  return query
    .replace(/\bcourtyard\b/giu, "кортъярд")
    .replace(/\bmarriott\b/giu, "марриотт")
    .replace(/\bhilton\b/giu, "хилтон")
    .replace(/\bhyatt\b/giu, "хаятт")
    .replace(/\bmarins\b/giu, "маринс");
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
