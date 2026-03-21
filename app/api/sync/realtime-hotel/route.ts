import { NextResponse } from "next/server";
import { startRealtimeSyncForHotel } from "@/server/services/portfolio-sync.service";

interface RealtimeHotelSyncRequestBody {
  hotelId?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RealtimeHotelSyncRequestBody;
    if (!body.hotelId) {
      return NextResponse.json({ message: "hotelId is required." }, { status: 400 });
    }

    const result = startRealtimeSyncForHotel(body.hotelId);
    return NextResponse.json({ result }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Realtime sync for hotel failed."
      },
      { status: 400 }
    );
  }
}
