import { NextResponse } from "next/server";
import {
  getPortfolioSyncReadiness,
  startPortfolioSync
} from "@/server/services/portfolio-sync.service";

interface PortfolioSyncRequestBody {
  mode?: "manual" | "weekly";
  hotelIds?: string[];
}

export async function GET(request: Request) {
  const authError = requireSyncToken(request);
  if (authError) {
    return authError;
  }

  try {
    const readiness = getPortfolioSyncReadiness();
    return NextResponse.json({ readiness });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить готовность портфельной синхронизации."
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const authError = requireSyncToken(request);
  if (authError) {
    return authError;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as PortfolioSyncRequestBody;
    const mode = body.mode === "weekly" ? "weekly" : "manual";
    const hotelIds = Array.isArray(body.hotelIds)
      ? body.hotelIds.filter((item): item is string => typeof item === "string" && !!item.trim())
      : undefined;

    const result = startPortfolioSync(mode, hotelIds);
    return NextResponse.json({ result }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось запустить портфельную синхронизацию."
      },
      { status: 400 }
    );
  }
}

function requireSyncToken(request: Request): NextResponse | null {
  const expectedToken = process.env.SYNC_TRIGGER_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      {
        message:
          "SYNC_TRIGGER_TOKEN не настроен на сервере. Укажите его перед запуском портфельной синхронизации."
      },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const actualToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!actualToken || actualToken !== expectedToken) {
    return NextResponse.json({ message: "Недостаточно прав доступа." }, { status: 401 });
  }

  return null;
}
