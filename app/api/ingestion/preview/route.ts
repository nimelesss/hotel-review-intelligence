import { NextResponse } from "next/server";
import { IngestionImportRequest } from "@/entities/types";
import {
  previewIngestion,
  resolveHotelId
} from "@/server/services/intelligence.service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IngestionImportRequest;
    if (!body.payload || !body.fileType || !body.sourceType) {
      return NextResponse.json(
        { message: "payload, fileType and sourceType are required." },
        { status: 400 }
      );
    }
    const result = previewIngestion({
      ...body,
      hotelId: resolveHotelId(body.hotelId)
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Preview failed" },
      { status: 400 }
    );
  }
}
