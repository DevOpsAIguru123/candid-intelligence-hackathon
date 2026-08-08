import { describe, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { getRepository } from "@/lib/repository";
import { identifySpeakerSignal } from "@/lib/openai-agent";

describe("OpenAI Signal Identification Script", () => {
  it("runs signal analysis on top ingested speakers", async () => {
    if (existsSync(".env")) {
      const envContent = readFileSync(".env", "utf8");
      const match = envContent.match(/OPENAI_API_KEY=(.*)/);
      if (match) process.env.OPENAI_API_KEY = match[1].trim();
    }

    const repo = getRepository();
    const conferences = await repo.listConferences();

    if (conferences.length === 0) {
      console.log("No conferences in database. Ingest a conference first.");
      return;
    }

    const conference = conferences[0];
    const speakers = await repo.listSpeakers(conference.id);

    console.log(`\n==================================================`);
    console.log(`OpenAI Signal Analysis for: ${conference.name}`);
    console.log(`==================================================\n`);

    const topSpeakers = speakers.slice(0, 3);

    for (const speaker of topSpeakers) {
      const signal = await identifySpeakerSignal(speaker, conference);
      console.log(`--------------------------------------------------`);
      console.log(`Speaker: ${signal.name} (${signal.company})`);
      console.log(`ICP Score: ${signal.icpScore}/100`);
      console.log(`Why Now Signal: ${signal.whyNowSignal}`);
      console.log(`Outreach Subject: ${signal.personalizedOutreach.subject}`);
      console.log(`Model Used: ${signal.agentModel}\n`);
    }
  }, 30_000);
});

