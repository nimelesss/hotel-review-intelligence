import { NextResponse } from "next/server";
import { CreateHotelRequest } from "@/entities/types";
import { getRepository } from "@/server/repositories";
import { createHotel } from "@/server/services/intelligence.service";

export async function GET() {
  const repository = getRepository();
  return NextResponse.json({
    items: repository.listHotels()
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
