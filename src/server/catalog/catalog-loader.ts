import fs from "node:fs";
import path from "node:path";
import { decodeEscapedUnicode, normalizeWhitespace } from "@/shared/lib/text";

export interface CatalogHotelRecord {
  externalId: string;
  name: string;
  city: string;
  country: string;
  address: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}

interface RawCatalogItem {
  id?: string | number;
  externalId?: string | number;
  hotelId?: string | number;
  uid?: string | number;
  name?: string;
  hotelName?: string;
  title?: string;
  city?: string;
  town?: string;
  locality?: string;
  country?: string;
  address?: string;
  fullAddress?: string;
  lat?: string | number;
  lon?: string | number;
  latitude?: string | number;
  longitude?: string | number;
}

export interface CatalogLoadResult {
  source: string;
  totalRows: number;
  records: CatalogHotelRecord[];
}

export function getCatalogSourceConfig(): {
  configured: boolean;
  source?: string;
} {
  const url = (process.env.RUSSIA_HOTELS_CATALOG_URL || "").trim();
  const filePath = (process.env.RUSSIA_HOTELS_CATALOG_PATH || "").trim();

  if (url) {
    return { configured: true, source: url };
  }
  if (filePath) {
    return { configured: true, source: resolveFilePath(filePath) };
  }
  return { configured: false };
}

export async function loadRussiaHotelsCatalog(limit?: number): Promise<CatalogLoadResult> {
  const source = resolveSourceOrThrow();
  const payload = await readSourcePayload(source);
  const rows = normalizeRows(payload);

  const maxLimit = resolveImportLimit(limit);
  const records = rows
    .map((row, index) => normalizeCatalogRecord(row, index))
    .filter((row): row is CatalogHotelRecord => !!row)
    .slice(0, maxLimit);

  return {
    source,
    totalRows: rows.length,
    records
  };
}

function resolveSourceOrThrow(): string {
  const config = getCatalogSourceConfig();
  if (config.configured && config.source) {
    return config.source;
  }
  throw new Error(
    "Не настроен источник каталога отелей. Укажите RUSSIA_HOTELS_CATALOG_URL или RUSSIA_HOTELS_CATALOG_PATH."
  );
}

async function readSourcePayload(source: string): Promise<unknown> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Ошибка загрузки каталога отелей: HTTP ${response.status}.`);
    }
    return response.json();
  }

  const filePath = source.startsWith("file://")
    ? source.slice("file://".length)
    : source;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл каталога не найден: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) {
    return [];
  }
  return JSON.parse(raw);
}

function normalizeRows(payload: unknown): RawCatalogItem[] {
  if (Array.isArray(payload)) {
    return payload.map(toRawCatalogItem).filter((item): item is RawCatalogItem => !!item);
  }
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    if (Array.isArray(object.items)) {
      return object.items
        .map(toRawCatalogItem)
        .filter((item): item is RawCatalogItem => !!item);
    }
    if (Array.isArray(object.data)) {
      return object.data
        .map(toRawCatalogItem)
        .filter((item): item is RawCatalogItem => !!item);
    }
    if (Array.isArray(object.hotels)) {
      return object.hotels
        .map(toRawCatalogItem)
        .filter((item): item is RawCatalogItem => !!item);
    }
  }
  throw new Error("Каталог отелей должен быть JSON-массивом или объектом с полем items/data/hotels.");
}

function toRawCatalogItem(item: unknown): RawCatalogItem | null {
  if (item && typeof item === "object") {
    return item as RawCatalogItem;
  }

  if (typeof item === "string") {
    const decoded = normalizeWhitespace(decodeEscapedUnicode(item));
    if (!decoded) {
      return null;
    }

    try {
      const parsed = JSON.parse(decoded) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as RawCatalogItem) : null;
    } catch {
      return {
        name: decoded,
        city: ""
      };
    }
  }

  return null;
}

function normalizeCatalogRecord(item: RawCatalogItem, index: number): CatalogHotelRecord | null {
  const name = firstNonEmpty(item.name, item.hotelName, item.title);
  const city = firstNonEmpty(item.city, item.town, item.locality);
  if (!name || !city) {
    return null;
  }

  const externalId = firstNonEmpty(
    asString(item.externalId),
    asString(item.hotelId),
    asString(item.id),
    asString(item.uid),
    `catalog-${slugify(name)}-${slugify(city)}-${index}`
  );

  const lat = asNumber(item.lat ?? item.latitude);
  const lon = asNumber(item.lon ?? item.longitude);

  return {
    externalId,
    name,
    city,
    country: firstNonEmpty(item.country, "Россия"),
    address: firstNonEmpty(item.address, item.fullAddress, `${name}, ${city}`),
    coordinates:
      typeof lat === "number" && typeof lon === "number"
        ? {
            lat,
            lon
          }
        : undefined
  };
}

function resolveImportLimit(limit?: number): number {
  if (typeof limit === "number" && Number.isFinite(limit)) {
    return Math.max(1, Math.min(200_000, Math.floor(limit)));
  }
  const parsed = Number(process.env.RUSSIA_HOTELS_IMPORT_LIMIT || "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 80_000;
  }
  return Math.max(1, Math.min(200_000, Math.floor(parsed)));
}

function resolveFilePath(input: string): string {
  if (path.isAbsolute(input)) {
    return input;
  }
  return path.join(process.cwd(), input);
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalized = normalizeWhitespace(decodeEscapedUnicode(value));
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = normalizeWhitespace(decodeEscapedUnicode(value));
    return normalized || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = Number(value.replace(",", "."));
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }
  return undefined;
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}
