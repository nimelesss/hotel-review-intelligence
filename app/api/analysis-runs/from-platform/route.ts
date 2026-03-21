import { NextResponse } from "next/server";
import { PlatformIngestionRequest } from "@/entities/types";
import {
  resolveHotelId,
  startPlatformIngestionRun
} from "@/server/services/intelligence.service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlatformIngestionRequest;
    if (!body.provider || !body.hotelId) {
      return NextResponse.json(
        { message: "provider and hotelId are required." },
        { status: 400 }
      );
    }
    if (!body.datasetUrl && !body.apifyDatasetUrl) {
      return NextResponse.json(
        {
          message:
            "datasetUrl is required for platform ingestion (Yandex/2GIS/aggregator export)."
        },
        { status: 400 }
      );
    }

    const run = startPlatformIngestionRun({
      ...body,
      hotelId: resolveHotelId(body.hotelId)
    });
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Platform ingestion start failed."
      },
      { status: 400 }
    );
  }
}
