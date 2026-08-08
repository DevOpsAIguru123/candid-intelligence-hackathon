import { NextResponse } from "next/server";
import { z } from "zod";

import { ingestConference } from "@/lib/ingest";
import { getRepository } from "@/lib/conference-repository";

export const runtime = "nodejs";

/**
 * Live ingestion only. The application shows real conference records or an
 * honest empty state — there is no sample dataset it can fall back to.
 */
const requestSchema = z.object({
  url: z.string().trim().min(1, "Provide a public conference URL."),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const result = await ingestConference({ url: parsed.data.url });
  if (!result.success) {
    return NextResponse.json(result, {
      status: result.errorCode === "FETCH_FAILED" ? 502 : 422,
    });
  }

  await getRepository().replaceConference(result);
  return NextResponse.json(result);
}
