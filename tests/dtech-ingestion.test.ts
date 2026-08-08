import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSampleGraph } from "@/tests/fixtures/conference-graph";
import { fetchDtechConference } from "@/lib/adapters/dtech";
import {
  createRepository,
  type ConferenceRepository,
} from "@/lib/conference-repository";

const rootHtml = readFileSync(join(__dirname, "fixtures/dtech/root.html"), "utf8");
const agendaHtml = readFileSync(join(__dirname, "fixtures/dtech/agenda.html"), "utf8");

const ROOT_URL = "https://dtech-root.example.test/";
const AGENDA_URL = "https://dtech-agenda.example.test/";
const NOW = new Date("2026-05-12T12:00:00.000Z");

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

async function captureConferenceSnapshot(
  repository: ConferenceRepository,
  conferenceId: string,
) {
  const conference = await repository.getConference(conferenceId);
  const speakers = (await repository.listSpeakers(conferenceId)).sort(compareById);
  const speakerIds = new Set(speakers.map((speaker) => speaker.id));
  const sequences = Object.fromEntries(
    await Promise.all(
      speakers.map(async (speaker) => [
        speaker.id,
        (await repository.listSequence(speaker.id)).sort(compareById),
      ]),
    ),
  );
  const funnelEvents = (await repository.listFunnelEvents())
    .filter((event) => speakerIds.has(event.speakerId))
    .sort(compareById);

  return { conference, speakers, sequences, funnelEvents };
}

describe("DTECH conference ingestion", () => {
  it("preserves an existing conference graph when DTECH is ingested", async () => {
    const repository = createRepository(":memory:");

    try {
      await repository.initialize();

      const demoGraph = buildSampleGraph();
      await repository.replaceConference(demoGraph);
      const demoBeforeDtech = await captureConferenceSnapshot(
        repository,
        demoGraph.conference.id,
      );

      const fixtureResponses: Record<string, string> = {
        [ROOT_URL]: rootHtml,
        [AGENDA_URL]: agendaHtml,
      };
      const dtechGraph = await fetchDtechConference({
        rootUrl: ROOT_URL,
        agendaUrl: AGENDA_URL,
        now: () => NOW,
        fetchText: async (url) => {
          const fixture = fixtureResponses[url];
          if (fixture === undefined) throw new Error(`Unmapped DTECH fixture URL: ${url}`);
          return fixture;
        },
      });

      await repository.replaceConference(dtechGraph);

      const persistedConferenceIds = (await repository.listConferences())
        .map((conference) => conference.id)
        .sort();
      expect(persistedConferenceIds).toEqual(
        [demoGraph.conference.id, dtechGraph.conference.id].sort(),
      );

      const demoAfterDtech = await captureConferenceSnapshot(
        repository,
        demoGraph.conference.id,
      );
      expect(demoAfterDtech).toEqual(demoBeforeDtech);

      const persistedDtechSpeakers = await repository.listSpeakers(dtechGraph.conference.id);
      const persistedDtechTasks = await repository.listResearchTasks({
        conferenceId: dtechGraph.conference.id,
      });
      expect(persistedDtechSpeakers).toHaveLength(dtechGraph.speakers.length);
      expect(persistedDtechTasks).toHaveLength(dtechGraph.researchTasks.length);
    } finally {
      await repository.close();
    }
  });
});
