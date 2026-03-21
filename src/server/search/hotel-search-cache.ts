import fs from "node:fs";
import path from "node:path";
import { HotelSearchResult } from "@/entities/types";
import { seedHotelSearchCatalog } from "@/data/seeds/hotel-search-catalog";

interface CacheFilePayload {
  updatedAt: string;
  items: HotelSearchResult[];
}

interface ImportedCatalogItem {
  id?: string | number;
  externalId?: string;
  name?: string;
  city?: string;
  country?: string;
  address?: string;
  lat?: number | string;
  lon?: number | string;
  latitude?: number | string;
  longitude?: number | string;
}

const DEFAULT_CACHE_LIMIT = 50_000;
const DEFAULT_MEMORY_TTL_MS = 60_000;

let memoryCache: HotelSearchResult[] | null = null;
let memoryLoadedAt = 0;
let remoteCatalogHydrated = false;

function getCachePath(): string {
  return process.env.HOTEL_SEARCH_CACHE_PATH || path.join(process.cwd(), ".hotel-search-cache.json");
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function signature(item: HotelSearchResult): string {
  const externalPart = item.externalId ? item.externalId.trim() : "";
  if (externalPart) {
    return `ext:${externalPart}`;
  }
  return `name:${normalize(item.name)}|city:${normalize(item.city)}|addr:${normalize(item.address)}`;
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
    return parsed.items;
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
    map.set(signature(item), item);
  }
  return [...map.values()];
}

function loadCache(): HotelSearchResult[] {
  if (memoryCache && Date.now() - memoryLoadedAt < getMemoryTtlMs()) {
    return memoryCache;
  }

  const fromDisk = readCacheFromDisk();
  const merged = mergeUnique([...seedHotelSearchCatalog, ...fromDisk]).slice(0, getCacheLimit());

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

function parseNumber(input: unknown): number | undefined {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function toCatalogResult(item: ImportedCatalogItem): HotelSearchResult | null {
  const name = (item.name || "").trim();
  const city = (item.city || "").trim();
  if (!name || !city) {
    return null;
  }

  const externalId =
    (item.externalId || "").toString().trim() ||
    (item.id || "").toString().trim() ||
    `import-${normalize(name)}-${normalize(city)}`;

  const lat = parseNumber(item.lat ?? item.latitude);
  const lon = parseNumber(item.lon ?? item.longitude);

  return {
    externalId,
    name,
    city,
    country: (item.country || "Россия").trim(),
    address: (item.address || `${name}, ${city}`).trim(),
    coordinates: typeof lat === "number" && typeof lon === "number" ? { lat, lon } : undefined,
    source: "catalog_import"
  };
}

export async function hydrateHotelCatalogFromRemoteSource(): Promise<void> {
  const remoteUrl = (process.env.RUSSIA_HOTELS_CATALOG_URL || "").trim();
  if (!remoteUrl || remoteCatalogHydrated) {
    return;
  }

  const response = await fetch(remoteUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Ошибка загрузки удаленного каталога отелей: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ImportedCatalogItem[];
  if (!Array.isArray(payload)) {
    throw new Error("Удаленный каталог отелей должен быть JSON-массивом.");
  }

  const imported = payload
    .map(toCatalogResult)
    .filter((item): item is HotelSearchResult => !!item)
    .slice(0, getCacheLimit());

  if (imported.length) {
    upsertHotelCatalog(imported);
  }

  remoteCatalogHydrated = true;
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
