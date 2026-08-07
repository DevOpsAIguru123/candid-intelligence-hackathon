import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getDemoConference } from "@/data/demo-conference";
import { ingestConference } from "@/lib/ingest";

const fixture = readFileSync("tests/fixtures/conference.html", "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ingestConference", () => {
  it("uses Firecrawl after a direct fetch is blocked", async () => {
    const result = await ingestConference(
      { url: "https://events.example" },
      {
        validateUrl: async (rawUrl) => new URL(rawUrl),
        fetchHtml: async () => {
          throw new Error("blocked");
        },
        fetchFirecrawlHtml: async () => fixture,
        now: () => new Date("2026-08-07T12:00:00.000Z"),
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected Firecrawl ingestion to succeed");
    expect(result.conference.sourceMode).toBe("firecrawl");
    expect(result.speakers).toHaveLength(2);
  });

  it("enables the Firecrawl fallback from the server-side API key", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "test-api-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, data: { rawHtml: fixture } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

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

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected configured Firecrawl ingestion to succeed");
    expect(result.conference.sourceMode).toBe("firecrawl");
  });

  it("returns a labeled fallback offer when direct fetch and Firecrawl both fail", async () => {
    const result = await ingestConference(
      { url: "https://events.example" },
      {
        validateUrl: async (rawUrl) => new URL(rawUrl),
        fetchHtml: async () => {
          throw new Error("blocked");
        },
        fetchFirecrawlHtml: async () => {
          throw new Error("scrape failed");
        },
        now: () => new Date("2026-08-07T12:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({ success: false, fallbackAvailable: true, errorCode: "FETCH_FAILED" });
    if (result.success) throw new Error("Expected ingestion to fail");
    expect(result.message).toContain("Firecrawl fallback failed");
    expect("conference" in result).toBe(false);
  });

  it("uses Firecrawl when directly fetched markup has no speaker records", async () => {
    const result = await ingestConference(
      { url: "https://events.example/agenda" },
      {
        validateUrl: async (rawUrl) => new URL(rawUrl),
        fetchHtml: async () => "<html><title>Conference</title><body>Loading agenda…</body></html>",
        fetchFirecrawlHtml: async () => fixture,
        now: () => new Date("2026-08-07T12:00:00.000Z"),
      },
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected rendered markup ingestion to succeed");
    expect(result.conference.sourceMode).toBe("firecrawl");
    expect(result.speakers).toHaveLength(2);
  });

  it("turns supported live markup into a scored conference graph", async () => {
    const result = await ingestConference(
      { url: "https://events.example/agenda" },
      {
        validateUrl: async (rawUrl) => new URL(rawUrl),
        fetchHtml: async () => fixture,
        fetchFirecrawlHtml: async () => {
          throw new Error("Firecrawl should not run when direct ingestion succeeds");
        },
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
