import { describe, expect, it } from "vitest";

import { getDemoConference } from "@/data/demo-conference";
import { createRepository } from "@/lib/repository";

describe("SpeakerSignalRepository", () => {
  it("replaces one conference graph atomically and reads its relationships", () => {
    const repository = createRepository(":memory:");
    const demoGraph = getDemoConference();

    repository.replaceConference(demoGraph);

    expect(repository.getConference(demoGraph.conference.id)?.sourceMode).toBe("demo");
    expect(repository.listSpeakers(demoGraph.conference.id)).toHaveLength(8);
    expect(repository.listSequence(demoGraph.speakers[0].id)).toHaveLength(5);
    expect(repository.listFunnelEvents()).toHaveLength(demoGraph.funnelEvents.length);
  });

  it("replaces existing conference children instead of duplicating them", () => {
    const repository = createRepository(":memory:");
    const demoGraph = getDemoConference();

    repository.replaceConference(demoGraph);
    repository.replaceConference(demoGraph);

    expect(repository.listConferences()).toHaveLength(1);
    expect(repository.listSpeakers(demoGraph.conference.id)).toHaveLength(8);
  });

  it("advances only to the immediate next funnel stage", () => {
    const repository = createRepository(":memory:");
    const demoGraph = getDemoConference();
    repository.replaceConference(demoGraph);
    const identifiedOnly = demoGraph.speakers.at(-1);
    if (!identifiedOnly) throw new Error("Demo speaker missing");

    expect(() => repository.advanceSpeaker(identifiedOnly.id, "replied")).toThrow(/next stage/i);
    const event = repository.advanceSpeaker(identifiedOnly.id, "qualified");
    expect(event.stage).toBe("qualified");
  });
});
