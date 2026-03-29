import { NextResponse } from "next/server";
import { StartReviewFetchJobRequest } from "@/server/services/review-fetch-jobs.service";
import {
  listReviewFetchJobsByHotel,
  startReviewFetchJob
} from "@/server/services/review-fetch-jobs.service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hotelId = (searchParams.get("hotelId") || "").trim();
  const limit = Number(searchParams.get("limit") || "20");

  if (!hotelId) {
    return NextResponse.json({ message: "Поле hotelId обязательно." }, { status: 400 });
  }

  const items = listReviewFetchJobsByHotel(hotelId, Number.isFinite(limit) ? limit : 20);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StartReviewFetchJobRequest;
    if (!body.hotelId?.trim()) {
      return NextResponse.json({ message: "Поле hotelId обязательно." }, { status: 400 });
    }

    const result = startReviewFetchJob({
      hotelId: body.hotelId.trim(),
      triggerType: body.triggerType || "manual",
      fromDate: body.fromDate,
      toDate: body.toDate,
      limit: body.limit
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось запустить job сбора отзывов."
      },
      { status: 400 }
    );
  }
}
