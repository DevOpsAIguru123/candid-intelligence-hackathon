import { describe, expect, it } from "vitest";
import { ingestConference } from "@/lib/ingest";
import { getRepository } from "@/lib/repository";

// Hits the network and writes into the configured database, which is the
// shared Supabase when DATABASE_URL is set. Opt in explicitly:
//   RUN_LIVE_INGEST=1 FIRECRAWL_API_KEY=... npm test
const liveEnabled = Boolean(process.env.RUN_LIVE_INGEST && process.env.FIRECRAWL_API_KEY);

describe("live ingestion", () => {
  it.skipIf(!liveEnabled)("ingests a live agenda through the rendered fallback", async () => {
    const result = await ingestConference({ url: "https://schedule.datacenterworld.com/speakers" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(`Ingestion failed: ${result.message}`);

    expect(result.conference.sourceMode).toBe("firecrawl");
    expect(result.speakers.length).toBeGreaterThan(0);

    const repo = getRepository();
    await repo.replaceConference(result);

    const savedConf = await repo.getConference(result.conference.id);
    expect(savedConf).not.toBeNull();
    expect(savedConf?.sourceMode).toBe("firecrawl");

    const savedSpeakers = await repo.listSpeakers(result.conference.id);
    expect(savedSpeakers.length).toBeGreaterThan(0);
    console.log(`Successfully ingested and saved ${savedSpeakers.length} live speakers for ${result.conference.name}!`);
  }, 40_000);
});
