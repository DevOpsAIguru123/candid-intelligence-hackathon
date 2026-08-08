import { NextResponse } from "next/server";

import { readCalendar } from "@/lib/calendar-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readCalendar(), { headers: { "cache-control": "no-store" } });
}
