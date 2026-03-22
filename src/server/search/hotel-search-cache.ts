import fs from "node:fs";
import path from "node:path";
import { HotelSearchResult } from "@/entities/types";
import { seedHotelSearchCatalog } from "@/data/seeds/hotel-search-catalog";
import importedSearchCatalog from "@/data/seeds/russia-hotels-search-catalog.json";
import { loadRussiaHotelsCatalog } from "@/server/catalog/catalog-loader";
import { decodeEscapedUnicode, normalizeSearchText, normalizeWhitespace } from "@/shared/lib/text";

interface CacheFilePayload {
  updatedAt: string;
  items: HotelSearchResult[];
}

const DEFAULT_CACHE_LIMIT = 50_000;
const DEFAULT_MEMORY_TTL_MS = 60_000;
const DEFAULT_INCLUDE_SEED_CATALOG = false;
const REMOTE_HYDRATE_RETRY_MS = 5 * 60 * 1000;
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

let memoryCache: HotelSearchResult[] | null = null;
let memoryLoadedAt = 0;
let remoteCatalogHydrated = false;
let remoteCatalogHydrationErrorAt = 0;

function getCachePath(): string {
  return process.env.HOTEL_SEARCH_CACHE_PATH || path.join(process.cwd(), ".hotel-search-cache.json");
}

function normalize(value: string): string {
  return normalizeSearchText(value);
}

function getCacheLimit(): number {
  const parsed = Number(process.env.HOTEL_SEARCH_CACHE_LIMIT || "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CACHE_LIMIT;
  }
  return Math.floor(parsed);
}

function getMemoryTtlMs(): number {
  const parsed = Number(process.env.HOTEL_SEARCH_CACHE_MEMORY_TTL_MS || "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MEMORY_TTL_MS;
  }
  return Math.floor(parsed);
}

function shouldIncludeSeedCatalog(): boolean {
  const raw = (process.env.HOTEL_SEARCH_INCLUDE_SEED || "").trim();
  if (!raw) {
    return DEFAULT_INCLUDE_SEED_CATALOG;
  }
  const normalized = raw.toLocaleLowerCase("ru-RU");
  return ["1", "true", "yes", "on"].includes(normalized);
}

function signature(item: HotelSearchResult): string {
  const normalizedName = normalize(stripCitySuffix(item.name, item.city));
  const normalizedCity = normalize(item.city);
  const coordinatesKey = item.coordinates
    ? `${item.coordinates.lat.toFixed(3)}|${item.coordinates.lon.toFixed(3)}`
    : "";
  return `name:${normalizedName}|city:${normalizedCity}|geo:${coordinatesKey}`;
}

function scoreCandidate(item: HotelSearchResult, query: string): number {
  const q = normalize(query);
  const name = normalize(item.name);
  const city = normalize(item.city);
  const address = normalize(item.address);

  if (!q) {
    return 0;
  }

  let score = 0;
  if (name === q) {
    score += 120;
  }
  if (name.startsWith(q)) {
    score += 80;
  }
  if (name.includes(q)) {
    score += 45;
  }
  if (city.startsWith(q) || city.includes(q)) {
    score += 24;
  }
  if (address.includes(q)) {
    score += 12;
  }

  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    const nameHits = tokens.filter((token) => name.includes(token)).length;
    const cityHits = tokens.filter((token) => city.includes(token)).length;
    const addressHits = tokens.filter((token) => address.includes(token)).length;
    score += nameHits * 12 + cityHits * 8 + addressHits * 4;
  }

  return score;
}

function ensureCacheFileExists(cachePath: string): void {
  const directory = path.dirname(cachePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  if (!fs.existsSync(cachePath)) {
    const initial: CacheFilePayload = {
      updatedAt: new Date().toISOString(),
      items: []
    };
    fs.writeFileSync(cachePath, JSON.stringify(initial), "utf8");
  }
}

function readCacheFromDisk(): HotelSearchResult[] {
  try {
    const cachePath = getCachePath();
    ensureCacheFileExists(cachePath);

    const raw = fs.readFileSync(cachePath, "utf8");
    if (!raw.trim()) {
      return [];
    }

    const parsed = JSON.parse(raw) as CacheFilePayload;
    if (!Array.isArray(parsed.items)) {
      return [];
    }

    return parsed.items
      .map((item) => sanitizeCatalogItem(item))
      .filter((item): item is HotelSearchResult => !!item);
  } catch {
    return [];
  }
}

function writeCacheToDisk(items: HotelSearchResult[]): void {
  try {
    const cachePath = getCachePath();
    ensureCacheFileExists(cachePath);
    const payload: CacheFilePayload = {
      updatedAt: new Date().toISOString(),
      items
    };
    fs.writeFileSync(cachePath, JSON.stringify(payload), "utf8");
  } catch {
    // Non-blocking. Search should keep working even if cache write fails.
  }
}

function mergeUnique(items: HotelSearchResult[]): HotelSearchResult[] {
  const map = new Map<string, HotelSearchResult>();
  for (const item of items) {
    const sanitized = sanitizeCatalogItem(item);
    if (!sanitized) {
      continue;
    }
    map.set(signature(sanitized), sanitized);
  }
  return [...map.values()];
}

function loadCache(): HotelSearchResult[] {
  if (memoryCache && Date.now() - memoryLoadedAt < getMemoryTtlMs()) {
    return memoryCache;
  }

  const includeSeed = shouldIncludeSeedCatalog();
  const fromDisk = readCacheFromDisk().filter((item) => (includeSeed ? true : !isSeedItem(item)));
  const seedItems = includeSeed
    ? [...seedHotelSearchCatalog, ...mapImportedSeedCatalog(importedSearchCatalog)]
    : [];
  const merged = mergeUnique([...seedItems, ...fromDisk]).slice(0, getCacheLimit());

  memoryCache = merged;
  memoryLoadedAt = Date.now();

  if (merged.length !== fromDisk.length) {
    writeCacheToDisk(merged);
  }

  return merged;
}

function saveCache(items: HotelSearchResult[]): void {
  memoryCache = items;
  memoryLoadedAt = Date.now();
  writeCacheToDisk(items);
}

function mapImportedSeedCatalog(value: unknown): HotelSearchResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeImportedSeedItem(item))
    .filter((item): item is HotelSearchResult => !!item);
}

function sanitizeImportedSeedItem(value: unknown): HotelSearchResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as Partial<HotelSearchResult>;

  return sanitizeCatalogItem({
    externalId: typeof item.externalId === "string" ? item.externalId : "",
    name: typeof item.name === "string" ? item.name : "",
    city: typeof item.city === "string" ? item.city : "",
    country: typeof item.country === "string" ? item.country : "Россия",
    address: typeof item.address === "string" ? item.address : "",
    coordinates: item.coordinates,
    source: "catalog_import"
  });
}

export async function hydrateHotelCatalogFromRemoteSource(): Promise<void> {
  if (remoteCatalogHydrated) {
    return;
  }
  if (
    remoteCatalogHydrationErrorAt > 0 &&
    Date.now() - remoteCatalogHydrationErrorAt < REMOTE_HYDRATE_RETRY_MS
  ) {
    return;
  }

  const hasSource =
    !!process.env.RUSSIA_HOTELS_CATALOG_URL?.trim() ||
    !!process.env.RUSSIA_HOTELS_CATALOG_PATH?.trim();

  if (!hasSource) {
    return;
  }

  try {
    const loaded = await loadRussiaHotelsCatalog(getCacheLimit());
    const imported = loaded.records
      .map((item) =>
        sanitizeCatalogItem({
          ...item,
          source: "catalog_import"
        })
      )
      .filter((item): item is HotelSearchResult => !!item);

    if (imported.length) {
      upsertHotelCatalog(imported);
    }
    remoteCatalogHydrated = true;
    remoteCatalogHydrationErrorAt = 0;
  } catch (error) {
    remoteCatalogHydrationErrorAt = Date.now();
    console.warn(
      `[hotel-search] remote catalog hydration skipped: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
}

export function searchHotelCatalog(query: string, limit: number): HotelSearchResult[] {
  const normalized = query.trim();
  if (normalized.length < 2) {
    return [];
  }

  const cache = loadCache();
  return cache
    .map((item) => ({
      item,
      score: scoreCandidate(item, normalized)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function upsertHotelCatalog(items: HotelSearchResult[]): void {
  if (!items.length) {
    return;
  }

  const existing = loadCache();
  const merged = mergeUnique([...items, ...existing]).slice(0, getCacheLimit());
  saveCache(merged);
}

function sanitizeCatalogItem(item: HotelSearchResult): HotelSearchResult | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const name = normalizeWhitespace(decodeEscapedUnicode(item.name || ""));
  const city = normalizeWhitespace(decodeEscapedUnicode(item.city || ""));
  if (!name || !city) {
    return null;
  }

  const country = normalizeWhitespace(decodeEscapedUnicode(item.country || "Россия")) || "Россия";
  const address =
    normalizeWhitespace(decodeEscapedUnicode(item.address || `${name}, ${city}`)) || `${name}, ${city}`;

  const externalIdRaw = normalizeWhitespace(decodeEscapedUnicode(item.externalId || ""));
  const externalId =
    externalIdRaw ||
    `cache-${normalize(name).replace(/\s+/g, "-")}-${normalize(city).replace(/\s+/g, "-")}`;

  return {
    externalId,
    name,
    city,
    country,
    address: compactAddress(address, city, country) || `${name}, ${city}`,
    coordinates: item.coordinates,
    source: item.source || "catalog_import"
  };
}

function isSeedItem(item: HotelSearchResult): boolean {
  return item.source === "catalog_seed" || item.externalId.startsWith("seed-");
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

function compactAddress(address: string, city: string, country: string): string {
  const cleaned = address
    .split(",")
    .map((part) => normalizeWhitespace(decodeEscapedUnicode(part)))
    .filter(Boolean)
    .filter((part) => {
      const normalized = normalize(part);
      return !ADDRESS_ADMIN_WORDS.some((word) => normalized.includes(word));
    });

  const deduped = dedupe(cleaned);
  const limited = deduped.slice(0, 3);
  if (city && !limited.some((part) => normalize(part) === normalize(city))) {
    limited.push(city);
  }
  if (country && !limited.some((part) => normalize(part) === normalize(country))) {
    limited.push(country);
  }

  return dedupe(limited).slice(0, 3).join(", ");
}

function dedupe(values: string[]): string[] {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

