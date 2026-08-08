import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ingestConference } from "@/lib/ingest";
import { getRepository } from "@/lib/repository";

describe("live ingestion", () => {
  it("ingests schedule.datacenterworld.com/speakers using Firecrawl API", async () => {
    const envText = readFileSync(".env", "utf8");
    const match = envText.match(/FIRECRAWL_API_KEY=(.*)/);
    if (match) process.env.FIRECRAWL_API_KEY = match[1].trim();

    const result = await ingestConference({ url: "https://schedule.datacenterworld.com/speakers" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(`Ingestion failed: ${result.message}`);

    expect(result.conference.sourceMode).toBe("firecrawl");
    expect(result.speakers.length).toBeGreaterThan(0);

    const repo = getRepository();
    repo.replaceConference(result);

    const savedConf = repo.getConference(result.conference.id);
    expect(savedConf).not.toBeNull();
    expect(savedConf?.sourceMode).toBe("firecrawl");

    const savedSpeakers = repo.listSpeakers(result.conference.id);
    expect(savedSpeakers.length).toBeGreaterThan(0);
    console.log(`Successfully ingested and saved ${savedSpeakers.length} live speakers for ${result.conference.name}!`);
  }, 40_000);
});
