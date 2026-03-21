import { NextResponse } from "next/server";
import { getSegmentPayload } from "@/server/services/intelligence.service";

interface Params {
  params: { hotelId: string };
}

export async function GET(_: Request, { params }: Params) {
  try {
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
