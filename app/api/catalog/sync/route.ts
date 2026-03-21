import { NextResponse } from "next/server";
import {
  getCatalogSyncReadiness,
  syncHotelsCatalog
} from "@/server/services/catalog-sync.service";

interface CatalogSyncRequestBody {
  limit?: number;
}

export async function GET(request: Request) {
  const authError = requireSyncToken(request);
  if (authError) {
    return authError;
  }

  try {
    const readiness = getCatalogSyncReadiness();
    return NextResponse.json({ readiness });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить статус синхронизации каталога."
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
    const body = (await request.json().catch(() => ({}))) as CatalogSyncRequestBody;
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined;
    const result = await syncHotelsCatalog(limit);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось синхронизировать каталог отелей."
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
          "SYNC_TRIGGER_TOKEN не настроен на сервере. Укажите его перед запуском синхронизации каталога."
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
