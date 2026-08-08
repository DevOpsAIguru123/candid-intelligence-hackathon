import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { buildSampleGraph } from "@/tests/fixtures/conference-graph";
import type {
  ConferenceIntelligenceGraph,
  ResearchTaskOutput,
} from "@/lib/conference-intelligence";
import { createPostgresRepository } from "@/lib/repository-postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getResearchOutput(summary: string): ResearchTaskOutput {
  return {
    schemaVersion: "1.0",
    summary,
    findings: [],
    unknowns: ["No additional supported details were found."],
  };
}

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;

describe("PostgresConferenceRepository URL Validation", () => {
  it("redacts credentials and throws fixed error on invalid DATABASE_URL", () => {
    const invalidUrl = "postgres://user:secret_pass_12345@invalid-host:999999/db";
    let caught: Error | null = null;
    try {
      createPostgresRepository(invalidUrl);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught?.message).toBe("Invalid DATABASE_URL configuration");
    expect(caught?.message).not.toContain("secret_pass_12345");
    expect(caught?.message).not.toContain("invalid-host");
    expect(JSON.stringify(caught)).not.toContain("secret_pass_12345");
  });
});

suite("PostgresConferenceRepository integration", () => {
  it("persists graph, sessions, and research tasks across replacement", async () => {
    if (!testUrl) return;

    const uniqueId = `pg-test-conf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const researchOutput = getResearchOutput("Verified PostgreSQL research output.");
    const baseGraph = buildSampleGraph();
    const speakerIds = new Map(
      baseGraph.speakers.map((speaker, index) => [speaker.id, `${uniqueId}:speaker:${index}`]),
    );

    const intelGraph: ConferenceIntelligenceGraph = {
      ...baseGraph,
      conference: {
        ...baseGraph.conference,
        id: uniqueId,
      },
      speakers: baseGraph.speakers.map((speaker) => ({
        ...speaker,
        id: speakerIds.get(speaker.id)!,
        conferenceId: uniqueId,
      })),
      sequences: baseGraph.sequences.map((step, index) => {
        const speakerId = speakerIds.get(step.speakerId);
        if (!speakerId) throw new Error(`Missing test speaker mapping for ${step.speakerId}`);
        return { ...step, id: `${uniqueId}:sequence:${index}`, speakerId };
      }),
      funnelEvents: baseGraph.funnelEvents.map((event, index) => {
        const speakerId = speakerIds.get(event.speakerId);
        if (!speakerId) throw new Error(`Missing test speaker mapping for ${event.speakerId}`);
        return { ...event, id: `${uniqueId}:event:${index}`, speakerId };
      }),
      sessions: [
        {
          id: `${uniqueId}:sess:1`,
          conferenceId: uniqueId,
          sourceId: "s1",
          sourceUrl: "https://example.com/s1",
          title: "Session 1",
          description: "Desc 1",
          startsAt: "2026-10-01T09:00:00Z",
          endsAt: "2026-10-01T10:00:00Z",
          location: "Room 1",
          track: "Track 1",
          sessionType: "Keynote",
        },
      ],
      sessionSpeakers: [
        {
          sessionId: `${uniqueId}:sess:1`,
          speakerId: speakerIds.get(baseGraph.speakers[0].id)!,
          role: "Keynote",
          evidenceUrl: "https://example.com/s1",
        },
      ],
      researchTasks: [
        {
          id: `${uniqueId}:task:1`,
          conferenceId: uniqueId,
          sessionId: `${uniqueId}:sess:1`,
          targetUrl: "https://example.com/s1",
          title: "Research Keynote",
          status: "pending",
          priority: 10,
          instructions: "Investigate speaker",
          claimedBy: null,
          claimedAt: null,
          completedAt: null,
          output: null,
        },
      ],
      coverage: {
        expectedSessionPages: 1,
        fetchedSessionPages: 1,
        expectedSessions: 1,
        extractedSessions: 1,
        expectedSpeakerPages: 1,
        fetchedSpeakerPages: 1,
        expectedIndexedSpeakers: 8,
        extractedIndexedSpeakers: 8,
        structuredAgendaSpeakers: 1,
        expectedDescriptionOnlySpeakers: 0,
        descriptionOnlySpeakers: 0,
        expectedTotalSpeakers: 8,
        totalSpeakers: 8,
        expectedResearchTasks: 1,
        extractedResearchTasks: 1,
      },
    };

    const repository = createPostgresRepository(testUrl);
    const inspector = postgres(testUrl, {
      ssl: "require",
      prepare: false,
      max: 1,
    });

    try {
      for (const filename of ["001_speaker_signal.sql", "002_coverage_contract.sql"]) {
        const migrationSql = await readFile(
          path.resolve(__dirname, `../db/migrations/${filename}`),
          "utf8",
        );
        await inspector.unsafe(migrationSql);
      }

      await repository.initialize();
      await repository.replaceConference(intelGraph);

      const fetchedConf = await repository.getConference(uniqueId);
      expect(fetchedConf?.name).toBe(baseGraph.conference.name);

      const coverageRows = await inspector`
        SELECT expected_description_only_speakers, description_only_speakers,
               expected_total_speakers, total_speakers,
               expected_research_tasks, extracted_research_tasks
        FROM speaker_signal.ingestion_coverage
        WHERE conference_id = ${uniqueId}
      `;
      expect(coverageRows[0]).toMatchObject({
        expected_description_only_speakers: 0,
        description_only_speakers: 0,
        expected_total_speakers: 8,
        total_speakers: 8,
        expected_research_tasks: 1,
        extracted_research_tasks: 1,
      });

      const tasks = await repository.listResearchTasks({ conferenceId: uniqueId });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(`${uniqueId}:task:1`);

      const claimed = await repository.claimResearchTask("agent-test", uniqueId);
      expect(claimed?.id).toBe(`${uniqueId}:task:1`);
      expect(claimed?.status).toBe("in_progress");

      const completed = await repository.completeResearchTask(
        claimed!.id,
        "agent-test",
        researchOutput,
      );
      expect(completed.status).toBe("complete");

      // Repeat-ingest preserves completed status & output
      await repository.replaceConference(intelGraph);

      const reIngestedTasks = await repository.listResearchTasks({ conferenceId: uniqueId });
      expect(reIngestedTasks).toHaveLength(1);
      expect(reIngestedTasks[0].status).toBe("complete");
      expect(reIngestedTasks[0].output).toEqual(researchOutput);
    } finally {
      try {
        await inspector`DELETE FROM speaker_signal.conferences WHERE id = ${uniqueId}`;
      } catch {
        // Ignore cleanup errors
      }
      await inspector.end();
      await repository.close();
    }
  }, 30_000);
});
