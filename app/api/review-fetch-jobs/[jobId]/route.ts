import { NextResponse } from "next/server";
import { getReviewFetchJobPayload } from "@/server/services/review-fetch-jobs.service";

interface Params {
  params: Promise<{
    jobId: string;
  }>;
}

export async function GET(_: Request, context: Params) {
  try {
    const params = await context.params;
    const jobId = (params.jobId || "").trim();
    if (!jobId) {
      return NextResponse.json({ message: "jobId is required." }, { status: 400 });
    }
    const payload = getReviewFetchJobPayload(jobId);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Не удалось загрузить данные job."
      },
      { status: 404 }
    );
  }
}
