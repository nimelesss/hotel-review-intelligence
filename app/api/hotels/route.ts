import { NextResponse } from "next/server";
import { getRepository } from "@/server/repositories";

export async function GET() {
  const repository = getRepository();
  return NextResponse.json({
    items: repository.listHotels()
  });
}
