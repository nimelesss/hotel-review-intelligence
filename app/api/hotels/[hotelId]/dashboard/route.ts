import { NextResponse } from "next/server";
import { getDashboardPayload } from "@/server/services/intelligence.service";
export async function GET(
  _: Request,
  context: { params: Promise<{ hotelId: string }> }
) {
  try {
    const params = await context.params;
    const { hotelId } = params;
    const payload = getDashboardPayload(hotelId);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ошибка формирования сводки.";
    const status = message.toLocaleLowerCase("ru-RU").includes("отель не найден")
      ? 404
      : 400;

    return NextResponse.json({ message }, { status });
  }
}
