import { NextResponse } from "next/server";
import { CreateHotelRequest } from "@/entities/types";
import { getRepository } from "@/server/repositories";
import { isSearchableHotelName } from "@/server/search/hotel-catalog-filter";
import { createHotel } from "@/server/services/intelligence.service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get("limit"));
  const repository = getRepository();
  const hotels = repository
    .listHotels()
    .filter((hotel) => isSearchableHotelName(hotel.name))
    .sort((a, b) => {
      const reviewDelta = (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
      if (reviewDelta !== 0) {
        return reviewDelta;
      }
      return (b.latestReviewDate || "").localeCompare(a.latestReviewDate || "");
    });
  const reviewedHotels = hotels.filter((hotel) => (hotel.reviewCount ?? 0) > 0);
  return NextResponse.json({
    items: (reviewedHotels.length ? reviewedHotels : hotels).slice(0, limit)
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateHotelRequest;
    if (!body.name || !body.city) {
      return NextResponse.json(
        { message: "Поля name и city обязательны." },
        { status: 400 }
      );
    }
    const hotel = createHotel(body);
    return NextResponse.json({ item: hotel }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось создать профиль отеля."
      },
      { status: 400 }
    );
  }
}

function clampLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 60;
  }

  return Math.min(200, Math.max(10, Math.floor(parsed)));
}
