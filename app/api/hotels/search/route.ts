import { NextResponse } from "next/server";
import { HotelSearchResult } from "@/entities/types";
import { getRepository } from "@/server/repositories";
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

  const items = hotels
    .filter((hotel) => (hotel.reviewCount ?? 0) > 0)
    .map((hotel) => ({
      item: {
        externalId: hotel.id,
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        address: hotel.address,
        coordinates: hotel.coordinates,
        source: "catalog_import" as const
      },
      score: scoreHotel(hotel, query)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);

  return NextResponse.json({ items });
}

function scoreHotel(
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
