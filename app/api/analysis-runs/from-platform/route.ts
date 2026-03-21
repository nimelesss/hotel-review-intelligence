import { NextResponse } from "next/server";
import { PlatformIngestionRequest } from "@/entities/types";
import {
  resolveHotelId,
  startPlatformIngestionRun
} from "@/server/services/intelligence.service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlatformIngestionRequest;
    if (!body.provider || !body.hotelId) {
      return NextResponse.json(
        { message: "Поля provider и hotelId обязательны." },
        { status: 400 }
      );
    }
    if (!body.datasetUrl && !body.apifyDatasetUrl) {
      return NextResponse.json(
        {
          message:
            "Для запуска укажите datasetUrl (или apifyDatasetUrl) с выгрузкой отзывов."
        },
        { status: 400 }
      );
    }

    const run = startPlatformIngestionRun({
      ...body,
      hotelId: resolveHotelId(body.hotelId)
    });
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось запустить сбор по площадке."
      },
      { status: 400 }
    );
  }
}
