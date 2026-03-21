import { NextResponse } from "next/server";
import { IngestionImportRequest } from "@/entities/types";
import { getRepository } from "@/server/repositories";
import {
  resolveHotelId,
  runIngestionImport
} from "@/server/services/intelligence.service";

export async function GET(request: Request) {
  const repository = getRepository();
  const url = new URL(request.url);
  const hotelId = resolveHotelId(url.searchParams.get("hotelId") ?? undefined);
  return NextResponse.json({
    items: repository.listRunsByHotel(hotelId)
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IngestionImportRequest;
    if (!body.payload || !body.fileType || !body.sourceType) {
      return NextResponse.json(
        { message: "payload, fileType и sourceType обязательны." },
        { status: 400 }
      );
    }
    const result = runIngestionImport({
      ...body,
      hotelId: resolveHotelId(body.hotelId)
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Import run failed" },
      { status: 400 }
    );
  }
}
