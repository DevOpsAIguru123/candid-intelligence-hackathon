import { NextResponse } from "next/server";
import { z } from "zod";

import { getDemoConference } from "@/data/demo-conference";
import { ingestConference } from "@/lib/ingest";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    url: z.string().trim().optional(),
    useDemo: z.boolean().optional(),
  })
  .refine((value) => value.useDemo === true || Boolean(value.url), {
    message: "Provide a conference URL or explicitly request demo data.",
  });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const repository = getRepository();
  if (parsed.data.useDemo) {
    const graph = getDemoConference();
    repository.replaceConference(graph);
    return NextResponse.json({ success: true, ...graph });
  }

  const result = await ingestConference({ url: parsed.data.url ?? "" });
  if (!result.success) {
    return NextResponse.json(result, {
      status: result.errorCode === "FETCH_FAILED" ? 502 : 422,
    });
  }

  repository.replaceConference(result);
  return NextResponse.json(result);
}
