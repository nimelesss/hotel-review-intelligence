import { NextResponse } from "next/server";
import { getSegmentPayload } from "@/server/services/intelligence.service";

export async function GET(_: Request, context: any) {
  try {
    const params = context?.params ?? {};
    const { hotelId } = params;
    const payload = getSegmentPayload(hotelId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Segment analytics error" },
      { status: 400 }
    );
  }
}
