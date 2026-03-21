import { NextResponse } from "next/server";
import { getDashboardPayload } from "@/server/services/intelligence.service";

interface Params {
  params: { hotelId: string };
}

export async function GET(_: Request, { params }: Params) {
  try {
    const { hotelId } = params;
    const payload = getDashboardPayload(hotelId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Dashboard error" },
      { status: 400 }
    );
  }
}
