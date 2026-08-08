import { describe, expect, it } from "vitest";

import { getDemoConference } from "@/data/demo-conference";
import type {
  ConferenceIntelligenceGraph,
  ResearchTask,
  ResearchTaskOutput,
} from "@/lib/conference-intelligence";
import { createRepository } from "@/lib/conference-repository";
import { SqliteConferenceRepository } from "@/lib/repository-sqlite";
import { DatabaseSync } from "node:sqlite";

function getResearchOutput(summary: string): ResearchTaskOutput {
  return {
    schemaVersion: "1.0",
    summary,
    findings: [],
    unknowns: ["No additional supported details were found."],
  };
}

function getMockIntelligenceGraph(): ConferenceIntelligenceGraph {
  const demoGraph = getDemoConference();
  return {
    ...demoGraph,
    sessions: [
      {
        id: "sess-1",
        conferenceId: demoGraph.conference.id,
        sourceId: "s-1",
        sourceUrl: "https://example.com/session/1",
        title: "Keynote: Intelligence Architecture",
        description: "Deep dive into intelligence engines.",
        startsAt: "2026-10-01T09:00:00Z",
        endsAt: "2026-10-01T10:00:00Z",
        location: "Main Stage",
        track: "Keynote",
        sessionType: "Keynote",
      },
      {
        id: "sess-2",
        conferenceId: demoGraph.conference.id,
        sourceId: "s-2",
        sourceUrl: "https://example.com/session/2",
        title: "Panel: Data Center Powering",
        description: "Discussion on high-density power grids.",
        startsAt: "2026-10-01T10:30:00Z",
        endsAt: "2026-10-01T11:30:00Z",
        location: "Room A",
        track: "Infrastructure",
        sessionType: "Session",
      },
    ],
    sessionSpeakers: [
      {
        sessionId: "sess-1",
        speakerId: demoGraph.speakers[0].id,
        role: "Keynote Speaker",
        evidenceUrl: "https://example.com/session/1",
      },
    ],
    researchTasks: [
      {
        id: "task-1",
        conferenceId: demoGraph.conference.id,
        sessionId: "sess-1",
        targetUrl: "https://example.com/session/1",
        title: "Research Keynote speaker signals",
        status: "pending",
        priority: 100,
        instructions: "Analyze background and company ICP score.",
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        output: null,
      },
      {
        id: "task-2",
        conferenceId: demoGraph.conference.id,
        sessionId: "sess-2",
        targetUrl: "https://example.com/session/2",
        title: "Research Panel speaker signals",
        status: "pending",
        priority: 50,
        instructions: "Extract secondary contacts.",
        claimedBy: null,
        claimedAt: null,
        completedAt: null,
        output: null,
      },
    ],
    coverage: {
      expectedSessionPages: 1,
      fetchedSessionPages: 1,
      expectedSessions: 2,
      extractedSessions: 2,
      expectedSpeakerPages: 1,
      fetchedSpeakerPages: 1,
      expectedIndexedSpeakers: 8,
      extractedIndexedSpeakers: 8,
      structuredAgendaSpeakers: 1,
      expectedDescriptionOnlySpeakers: 0,
      descriptionOnlySpeakers: 0,
      expectedTotalSpeakers: 8,
      totalSpeakers: 8,
      expectedResearchTasks: 2,
      extractedResearchTasks: 2,
    },
  };
}

describe("SpeakerSignalRepository", () => {
  it("replaces one conference graph atomically and reads its relationships", async () => {
    const repository = createRepository(":memory:");
    const demoGraph = getDemoConference();

    await repository.replaceConference(demoGraph);

    const conf = await repository.getConference(demoGraph.conference.id);
    const speakers = await repository.listSpeakers(demoGraph.conference.id);
    const seq = await repository.listSequence(demoGraph.speakers[0].id);
    const events = await repository.listFunnelEvents();

    expect(conf?.sourceMode).toBe("demo");
    expect(speakers).toHaveLength(8);
    expect(seq).toHaveLength(5);
    expect(events).toHaveLength(demoGraph.funnelEvents.length);
  });

  it("replaces existing conference children instead of duplicating them", async () => {
    const repository = createRepository(":memory:");
    const demoGraph = getDemoConference();

    await repository.replaceConference(demoGraph);
    await repository.replaceConference(demoGraph);

    const conferences = await repository.listConferences();
    const speakers = await repository.listSpeakers(demoGraph.conference.id);

    expect(conferences).toHaveLength(1);
    expect(speakers).toHaveLength(8);
  });

  it("advances only to the immediate next funnel stage", async () => {
    const repository = createRepository(":memory:");
    const demoGraph = getDemoConference();
    await repository.replaceConference(demoGraph);
    const identifiedOnly = demoGraph.speakers.at(-1);
    if (!identifiedOnly) throw new Error("Demo speaker missing");

    await expect(repository.advanceSpeaker(identifiedOnly.id, "replied")).rejects.toThrow(/next stage/i);
    const event = await repository.advanceSpeaker(identifiedOnly.id, "qualified");
    expect(event.stage).toBe("qualified");
  });

  it("handles research tasks: atomic claim, complete ownership checks, and status validation", async () => {
    const repository = createRepository(":memory:");
    const graph = getMockIntelligenceGraph();
    const output = getResearchOutput("Verified research findings.");

    await repository.replaceConference(graph);

    const allTasks = await repository.listResearchTasks({ conferenceId: graph.conference.id });
    expect(allTasks).toHaveLength(2);

    // Highest priority task claimed first
    const claimed1 = await repository.claimResearchTask("agent-alpha", graph.conference.id);
    expect(claimed1?.id).toBe("task-1");
    expect(claimed1?.status).toBe("in_progress");
    expect(claimed1?.claimedBy).toBe("agent-alpha");

    // Next claimed
    const claimed2 = await repository.claimResearchTask("agent-beta", graph.conference.id);
    expect(claimed2?.id).toBe("task-2");
    expect(claimed2?.status).toBe("in_progress");
    expect(claimed2?.claimedBy).toBe("agent-beta");

    // No tasks left pending
    const noneLeft = await repository.claimResearchTask("agent-gamma", graph.conference.id);
    expect(noneLeft).toBeNull();

    // Wrong agent completion throws
    await expect(
      repository.completeResearchTask("task-1", "agent-beta", output),
    ).rejects.toThrow(/not claimed by agent/i);

    // Correct agent completes task-1
    const completed1 = await repository.completeResearchTask("task-1", "agent-alpha", output);
    expect(completed1.status).toBe("complete");
    expect(completed1.output).toEqual(output);

    // Completing an already completed task throws (not in_progress)
    await expect(
      repository.completeResearchTask("task-1", "agent-alpha", output),
    ).rejects.toThrow(/not in progress/i);
  });

  it("preserves task status, claim, and output during graph repeat-ingest", async () => {
    const repository = createRepository(":memory:");
    const graph = getMockIntelligenceGraph();
    const output = getResearchOutput("Analysis complete.");

    await repository.replaceConference(graph);

    // Claim and complete task-1
    const claimed1 = await repository.claimResearchTask("agent-1", graph.conference.id);
    if (!claimed1) throw new Error("Task 1 not claimed");
    await repository.completeResearchTask(claimed1.id, "agent-1", output);

    // Claim task-2
    const claimed2 = await repository.claimResearchTask("agent-2", graph.conference.id);
    if (!claimed2) throw new Error("Task 2 not claimed");

    // Repeat-ingest the exact same graph
    await repository.replaceConference(graph);

    const reIngestedTasks = await repository.listResearchTasks({ conferenceId: graph.conference.id });
    const task1 = reIngestedTasks.find((t) => t.id === "task-1");
    const task2 = reIngestedTasks.find((t) => t.id === "task-2");

    expect(task1?.status).toBe("complete");
    expect(task1?.claimedBy).toBe("agent-1");
    expect(task1?.output).toEqual(output);

    expect(task2?.status).toBe("in_progress");
    expect(task2?.claimedBy).toBe("agent-2");

    // Re-ingest with a graph where task-2 is removed
    const graphWithoutTask2: ConferenceIntelligenceGraph = {
      ...graph,
      sessions: [graph.sessions[0]],
      researchTasks: [graph.researchTasks[0]],
    };

    await repository.replaceConference(graphWithoutTask2);

    const remainingTasks = await repository.listResearchTasks({ conferenceId: graph.conference.id });
    expect(remainingTasks).toHaveLength(1);
    expect(remainingTasks[0].id).toBe("task-1");
    expect(remainingTasks[0].status).toBe("complete");
  });

  it("clears intelligence tasks/coverage and derives sessions when replaced with a base ConferenceGraph", async () => {
    const repository = createRepository(":memory:");
    const intelGraph = getMockIntelligenceGraph();

    // 1. Ingest intelligence graph
    await repository.replaceConference(intelGraph);
    const initialTasks = await repository.listResearchTasks({ conferenceId: intelGraph.conference.id });
    expect(initialTasks).toHaveLength(2);

    // 2. Replace with base ConferenceGraph for the same conference ID
    const demoGraph = getDemoConference();
    await repository.replaceConference(demoGraph);

    // 3. Research tasks and coverage must be cleared
    const clearedTasks = await repository.listResearchTasks({ conferenceId: demoGraph.conference.id });
    expect(clearedTasks).toHaveLength(0);

    // 4. Speakers and sequences are intact
    const speakers = await repository.listSpeakers(demoGraph.conference.id);
    expect(speakers).toHaveLength(8);
  });

  it("allows initialization retry when first attempt fails", async () => {
    let failFirst = true;
    class TestRepo extends SqliteConferenceRepository {
      async initialize(): Promise<void> {
        if (failFirst) {
          failFirst = false;
          throw new Error("Transient init error");
        }
        await super.initialize();
      }
    }

    const repo = new TestRepo(new DatabaseSync(":memory:"));

    // First attempt fails
    await expect(repo.listConferences()).rejects.toThrow("Transient init error");

    // Second attempt retries initialize and succeeds
    const conferences = await repo.listConferences();
    expect(conferences).toEqual([]);
  });

  it("persists the expanded ingestion coverage contract", async () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteConferenceRepository(database);
    const graph = getMockIntelligenceGraph();

    await repository.replaceConference(graph);

    const coverage = database
      .prepare(`
        SELECT expected_description_only_speakers, description_only_speakers,
               expected_total_speakers, total_speakers,
               expected_research_tasks, extracted_research_tasks
        FROM ingestion_coverage
        WHERE conference_id = ?
      `)
      .get(graph.conference.id);
    expect(coverage).toMatchObject({
      expected_description_only_speakers: 0,
      description_only_speakers: 0,
      expected_total_speakers: 8,
      total_speakers: 8,
      expected_research_tasks: 2,
      extracted_research_tasks: 2,
    });
    await repository.close();
  });

  it("adds expanded coverage columns to an existing SQLite schema", async () => {
    const database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE ingestion_coverage (
        conference_id TEXT PRIMARY KEY,
        expected_session_pages INTEGER NOT NULL,
        fetched_session_pages INTEGER NOT NULL,
        expected_sessions INTEGER NOT NULL,
        extracted_sessions INTEGER NOT NULL,
        expected_speaker_pages INTEGER NOT NULL,
        fetched_speaker_pages INTEGER NOT NULL,
        expected_indexed_speakers INTEGER NOT NULL,
        extracted_indexed_speakers INTEGER NOT NULL,
        structured_agenda_speakers INTEGER NOT NULL,
        description_only_speakers INTEGER NOT NULL,
        total_speakers INTEGER NOT NULL
      )
    `);
    const repository = new SqliteConferenceRepository(database);

    await repository.initialize();

    const columnNames = new Set(
      (database.prepare("PRAGMA table_info(ingestion_coverage)").all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    );
    expect(columnNames.has("expected_description_only_speakers")).toBe(true);
    expect(columnNames.has("expected_total_speakers")).toBe(true);
    expect(columnNames.has("expected_research_tasks")).toBe(true);
    expect(columnNames.has("extracted_research_tasks")).toBe(true);
    await repository.close();
  });
});
