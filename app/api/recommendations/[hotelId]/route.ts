import { NextResponse } from "next/server";
import { getRecommendationPayload } from "@/server/services/intelligence.service";

export async function GET(_: Request, context: any) {
  try {
    const params = context?.params ?? {};
    const { hotelId } = params;
    const payload = getRecommendationPayload(hotelId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Ошибка формирования рекомендаций."
      },
      { status: 400 }
    );
  }
}
