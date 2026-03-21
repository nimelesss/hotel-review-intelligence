import { NextResponse } from "next/server";
import { HotelSearchResult } from "@/entities/types";

interface NominatimItem {
  place_id: number;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  addresstype?: string;
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
  "apartments",
  "resort"
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const limit = clampLimit(searchParams.get("limit"));

  if (query.length < 2) {
    return NextResponse.json(
      { message: "Введите минимум 2 символа для поиска отеля." },
      { status: 400 }
    );
  }

  try {
    const nominatimUrl = new URL("https://nominatim.openstreetmap.org/search");
    nominatimUrl.searchParams.set("q", query);
    nominatimUrl.searchParams.set("format", "jsonv2");
    nominatimUrl.searchParams.set("addressdetails", "1");
    nominatimUrl.searchParams.set("countrycodes", "ru");
    nominatimUrl.searchParams.set("limit", String(Math.max(20, limit * 3)));
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

    const payload = (await response.json()) as NominatimItem[];
    const items = payload
      .filter(isHotelEntity)
      .map(mapNominatimToHotelSearchResult)
      .filter((item): item is HotelSearchResult => !!item.name && !!item.city)
      .slice(0, limit);

    return NextResponse.json({ items });
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

function isHotelEntity(item: NominatimItem): boolean {
  if (item.class === "tourism" && item.type && ALLOWED_TYPES.has(item.type)) {
    return true;
  }
  const haystack = `${item.name || ""} ${item.display_name || ""}`.toLocaleLowerCase("ru-RU");
  return haystack.includes("отель") || haystack.includes("hotel");
}

function mapNominatimToHotelSearchResult(item: NominatimItem): HotelSearchResult {
  const city =
    item.address?.city ||
    item.address?.town ||
    item.address?.village ||
    item.address?.municipality ||
    item.address?.state ||
    "Не указан";

  const displayName = item.display_name || "";
  const normalizedName = normalizeHotelName(item.name || displayName);

  return {
    externalId: String(item.place_id),
    name: normalizedName,
    city,
    country: item.address?.country || "Россия",
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
  return candidate;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.min(12, Math.max(4, Math.floor(parsed)));
}
