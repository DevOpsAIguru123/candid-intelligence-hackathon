import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getDemoConference } from "@/data/demo-conference";
import { ingestConference } from "@/lib/ingest";

const fixture = readFileSync("tests/fixtures/conference.html", "utf8");

describe("ingestConference", () => {
  it("returns a labeled fallback offer without silently substituting demo data", async () => {
    const result = await ingestConference(
      { url: "https://events.example" },
      {
        validateUrl: async (rawUrl) => new URL(rawUrl),
        fetchHtml: async () => {
          throw new Error("blocked");
        },
        now: () => new Date("2026-08-07T12:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      success: false,
      fallbackAvailable: true,
      errorCode: "FETCH_FAILED",
    });
    expect("conference" in result).toBe(false);
  });

  it("turns supported live markup into a scored conference graph", async () => {
    const result = await ingestConference(
      { url: "https://events.example/agenda" },
      {
        validateUrl: async (rawUrl) => new URL(rawUrl),
        fetchHtml: async () => fixture,
        now: () => new Date("2026-08-07T12:00:00.000Z"),
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected successful ingestion");
    expect(result.conference.sourceMode).toBe("live");
    expect(result.speakers).toHaveLength(2);
    expect(result.speakers[0].score).toBeGreaterThanOrEqual(result.speakers[1].score);
    expect(result.sequences).toHaveLength(10);
  });
});

describe("demo conference", () => {
  it("is explicitly labeled and exercises every funnel stage", () => {
    const demo = getDemoConference();

    expect(demo.conference.sourceMode).toBe("demo");
    expect(demo.speakers).toHaveLength(8);
    expect(new Set(demo.funnelEvents.map((event) => event.stage)).size).toBe(8);
  });
});
