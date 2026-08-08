import { describe, expect, it } from "vitest";

import { buildSampleGraph } from "@/tests/fixtures/conference-graph";
import { createRepository, resolveDatabasePath } from "@/lib/repository";

describe("SpeakerSignalRepository", () => {
  it("replaces one conference graph atomically and reads its relationships", async () => {
    const repository = createRepository(":memory:");
    const demoGraph = buildSampleGraph();

    await repository.replaceConference(demoGraph);

    expect((await repository.getConference(demoGraph.conference.id))?.sourceMode).toBe("demo");
    expect(await repository.listSpeakers(demoGraph.conference.id)).toHaveLength(8);
    expect(await repository.listSequence(demoGraph.speakers[0].id)).toHaveLength(5);
    expect(await repository.listFunnelEvents()).toHaveLength(demoGraph.funnelEvents.length);
  });

  it("replaces existing conference children instead of duplicating them", async () => {
    const repository = createRepository(":memory:");
    const demoGraph = buildSampleGraph();

    await repository.replaceConference(demoGraph);
    await repository.replaceConference(demoGraph);

    expect(await repository.listConferences()).toHaveLength(1);
    expect(await repository.listSpeakers(demoGraph.conference.id)).toHaveLength(8);
  });

  it("advances only to the immediate next funnel stage", async () => {
    const repository = createRepository(":memory:");
    const demoGraph = buildSampleGraph();
    await repository.replaceConference(demoGraph);
    const identifiedOnly = demoGraph.speakers.at(-1);
    if (!identifiedOnly) throw new Error("Demo speaker missing");

    await expect(repository.advanceSpeaker(identifiedOnly.id, "replied")).rejects.toThrow(/next stage/i);
    const event = await repository.advanceSpeaker(identifiedOnly.id, "qualified");
    expect(event.stage).toBe("qualified");
  });
});

describe("resolveDatabasePath", () => {
  it("keeps the repository-relative default outside serverless runtimes", async () => {
    expect(resolveDatabasePath({})).toBe("data/speaker-signal.db");
  });

  it("falls back to the only writable directory on Vercel", async () => {
    expect(resolveDatabasePath({ VERCEL: "1" })).toBe("/tmp/speaker-signal.db");
  });

  it("prefers an explicit DATABASE_PATH over every default", async () => {
    expect(resolveDatabasePath({ VERCEL: "1", DATABASE_PATH: "/tmp/custom.db" })).toBe("/tmp/custom.db");
    expect(resolveDatabasePath({ DATABASE_PATH: "  " })).toBe("data/speaker-signal.db");
  });
});
