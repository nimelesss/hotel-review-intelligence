import { NextResponse } from "next/server";
import { startReviewFetchJob } from "@/server/services/review-fetch-jobs.service";

interface RealtimeHotelSyncRequestBody {
  hotelId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RealtimeHotelSyncRequestBody;
    if (!body.hotelId) {
      return NextResponse.json({ message: "Поле hotelId обязательно." }, { status: 400 });
    }

    const launched = startReviewFetchJob({
      hotelId: body.hotelId,
      triggerType: "manual"
    });
    const result = {
      mode: "manual" as const,
      startedAt: new Date().toISOString(),
      targetsTotal: 1,
      targetsStarted: 1,
      hotelsCovered: 1,
      runs: [launched.run],
      warnings: launched.warnings
    };
    return NextResponse.json({ result }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось запустить синхронизацию по отелю."
      },
      { status: 400 }
    );
  }
}
