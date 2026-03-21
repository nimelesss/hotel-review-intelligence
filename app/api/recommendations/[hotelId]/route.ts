import { NextResponse } from "next/server";
import { getRecommendationPayload } from "@/server/services/intelligence.service";

interface Params {
  params: { hotelId: string };
}

export async function GET(_: Request, { params }: Params) {
  try {
    const { hotelId } = params;
    const payload = getRecommendationPayload(hotelId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Recommendations payload error"
      },
      { status: 400 }
    );
  }
}
