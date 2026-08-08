import { createHash } from "node:crypto";
import postgres from "postgres";

import {
  FUNNEL_STAGES,
  type Conference,
  type ConferenceGraph,
  type FunnelEvent,
  type FunnelStage,
  type SequenceStep,
  type Speaker,
} from "@/lib/domain";
import {
  isConferenceIntelligenceGraph,
  researchTaskOutputSchema,
  type ConferenceIntelligenceGraph,
  type ResearchTask,
  type ResearchTaskOutput,
  type ResearchTaskStatus,
} from "@/lib/conference-intelligence";
import { nextFunnelStage } from "@/lib/funnel";
import type { ConferenceRepository, ListResearchTasksOptions } from "@/lib/repository-contract";

type SqlRow = Record<string, unknown>;

function mapConference(row: SqlRow): Conference {
  return {
    id: String(row.id),
    name: String(row.name),
    sourceUrl: String(row.source_url),
    location: String(row.location),
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : String(row.starts_at),
    endsAt: row.ends_at instanceof Date ? row.ends_at.toISOString() : String(row.ends_at),
    sourceMode: String(row.source_mode) as Conference["sourceMode"],
    ingestionStatus: String(row.ingestion_status) as Conference["ingestionStatus"],
    lastIngestedAt:
      row.last_ingested_at instanceof Date
        ? row.last_ingested_at.toISOString()
        : String(row.last_ingested_at),
  };
}

function mapSpeaker(row: SqlRow): Speaker {
  const scoreReasons =
    typeof row.score_reasons === "string"
      ? (JSON.parse(row.score_reasons) as Speaker["scoreReasons"])
      : (row.score_reasons as Speaker["scoreReasons"]);

  return {
    id: String(row.id),
    conferenceId: String(row.conference_id),
    name: String(row.name),
    title: String(row.title),
    company: String(row.company),
    sessionTitle: String(row.session_title),
    score: Number(row.score),
    scoreReasons,
    dedupeKey: String(row.dedupe_key),
  };
}

function mapSequence(row: SqlRow): SequenceStep {
  return {
    id: String(row.id),
    speakerId: String(row.speaker_id),
    offsetDays: Number(row.offset_days),
    scheduledAt:
      row.scheduled_at instanceof Date
        ? row.scheduled_at.toISOString()
        : String(row.scheduled_at),
    channel: String(row.channel) as SequenceStep["channel"],
    status: String(row.status) as SequenceStep["status"],
    subject: String(row.subject),
    message: String(row.message),
  };
}

function mapEvent(row: SqlRow): FunnelEvent {
  return {
    id: String(row.id),
    speakerId: String(row.speaker_id),
    stage: String(row.stage) as FunnelStage,
    occurredAt:
      row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
  };
}

function mapResearchTask(row: SqlRow): ResearchTask {
  const rawOutput =
    row.output == null
      ? null
      : typeof row.output === "string"
        ? (JSON.parse(row.output) as unknown)
        : row.output;
  const output = rawOutput == null ? null : researchTaskOutputSchema.parse(rawOutput);

  return {
    id: String(row.id),
    conferenceId: String(row.conference_id),
    sessionId: String(row.session_id),
    targetUrl: String(row.target_url),
    title: String(row.title),
    status: String(row.status) as ResearchTaskStatus,
    priority: Number(row.priority),
    instructions: String(row.instructions),
    claimedBy: row.claimed_by ? String(row.claimed_by) : null,
    claimedAt:
      row.claimed_at instanceof Date
        ? row.claimed_at.toISOString()
        : row.claimed_at
          ? String(row.claimed_at)
          : null,
    completedAt:
      row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : row.completed_at
          ? String(row.completed_at)
          : null,
    output,
  };
}

function derivedSessionId(conferenceId: string, sessionTitle: string): string {
  const hash = createHash("sha256").update(sessionTitle).digest("hex").slice(0, 12);
  return `${conferenceId}:session:${hash}`;
}

export class PostgresConferenceRepository implements ConferenceRepository {
  private readonly sql: postgres.Sql;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(connectionString: string) {
    try {
      this.sql = postgres(connectionString, {
        ssl: "require",
        prepare: false,
        max: 5,
      });
    } catch {
      throw new Error("Invalid DATABASE_URL configuration");
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          await this.initialize();
        } catch (error) {
          this.initPromise = null;
          throw error;
        }
      })();
    }
    await this.initPromise;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const rows = await this.sql`
        SELECT version FROM speaker_signal.schema_migrations
        WHERE version = '002_coverage_contract'
      `;
      const sqlRows = rows as unknown as SqlRow[];
      if (sqlRows.length === 0) {
        throw new Error("Database schema missing or outdated. Run pnpm db:migrate");
      }
      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Run pnpm db:migrate")) {
        throw error;
      }
      throw new Error("Database readiness check failed. Run pnpm db:migrate");
    }
  }

  async replaceConference(graph: ConferenceGraph | ConferenceIntelligenceGraph): Promise<void> {
    await this.ensureInitialized();
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO speaker_signal.conferences (
          id, name, source_url, location, starts_at, ends_at,
          source_mode, ingestion_status, last_ingested_at
        ) VALUES (
          ${graph.conference.id},
          ${graph.conference.name},
          ${graph.conference.sourceUrl},
          ${graph.conference.location},
          ${graph.conference.startsAt},
          ${graph.conference.endsAt},
          ${graph.conference.sourceMode},
          ${graph.conference.ingestionStatus},
          ${graph.conference.lastIngestedAt}
        )
        ON CONFLICT(id) DO UPDATE SET
          name=EXCLUDED.name,
          source_url=EXCLUDED.source_url,
          location=EXCLUDED.location,
          starts_at=EXCLUDED.starts_at,
          ends_at=EXCLUDED.ends_at,
          source_mode=EXCLUDED.source_mode,
          ingestion_status=EXCLUDED.ingestion_status,
          last_ingested_at=EXCLUDED.last_ingested_at
      `;

      await tx`DELETE FROM speaker_signal.speakers WHERE conference_id = ${graph.conference.id}`;

      for (const speaker of graph.speakers) {
        await tx`
          INSERT INTO speaker_signal.speakers (
            id, conference_id, name, title, company, session_title,
            score, score_reasons, dedupe_key
          ) VALUES (
            ${speaker.id},
            ${speaker.conferenceId},
            ${speaker.name},
            ${speaker.title},
            ${speaker.company},
            ${speaker.sessionTitle},
            ${speaker.score},
            ${tx.json(speaker.scoreReasons as unknown as postgres.JSONValue)},
            ${speaker.dedupeKey}
          )
        `;
      }

      for (const step of graph.sequences) {
        await tx`
          INSERT INTO speaker_signal.sequence_steps (
            id, speaker_id, offset_days, scheduled_at, channel, status, subject, message
          ) VALUES (
            ${step.id},
            ${step.speakerId},
            ${step.offsetDays},
            ${step.scheduledAt},
            ${step.channel},
            ${step.status},
            ${step.subject},
            ${step.message}
          )
        `;
      }

      for (const event of graph.funnelEvents) {
        await tx`
          INSERT INTO speaker_signal.funnel_events (
            id, speaker_id, stage, occurred_at
          ) VALUES (
            ${event.id},
            ${event.speakerId},
            ${event.stage},
            ${event.occurredAt}
          )
        `;
      }

      if (isConferenceIntelligenceGraph(graph)) {
        const existingRows = await tx`
          SELECT * FROM speaker_signal.research_tasks
          WHERE conference_id = ${graph.conference.id}
          FOR UPDATE
        `;
        const existingTasks = (existingRows as unknown as SqlRow[]).map(mapResearchTask);

        const existingTaskMap = new Map(existingTasks.map((t) => [t.id, t]));
        const incomingTaskIds = new Set(graph.researchTasks.map((t) => t.id));
        const incomingSessionIds = new Set(graph.sessions.map((s) => s.id));

        for (const session of graph.sessions) {
          await tx`
            INSERT INTO speaker_signal.conference_sessions (
              id, conference_id, source_id, source_url, title, description,
              starts_at, ends_at, location, track, session_type
            ) VALUES (
              ${session.id},
              ${session.conferenceId},
              ${session.sourceId},
              ${session.sourceUrl},
              ${session.title},
              ${session.description},
              ${session.startsAt},
              ${session.endsAt},
              ${session.location},
              ${session.track},
              ${session.sessionType}
            )
            ON CONFLICT(id) DO UPDATE SET
              conference_id=EXCLUDED.conference_id,
              source_id=EXCLUDED.source_id,
              source_url=EXCLUDED.source_url,
              title=EXCLUDED.title,
              description=EXCLUDED.description,
              starts_at=EXCLUDED.starts_at,
              ends_at=EXCLUDED.ends_at,
              location=EXCLUDED.location,
              track=EXCLUDED.track,
              session_type=EXCLUDED.session_type
          `;
        }

        for (const task of graph.researchTasks) {
          const existing = existingTaskMap.get(task.id);
          const status = existing ? existing.status : task.status;
          const claimedBy = existing ? existing.claimedBy : task.claimedBy;
          const claimedAt = existing ? existing.claimedAt : task.claimedAt;
          const completedAt = existing ? existing.completedAt : task.completedAt;
          const output = existing ? existing.output : task.output;

          await tx`
            INSERT INTO speaker_signal.research_tasks (
              id, conference_id, session_id, target_url, title, status, priority,
              instructions, claimed_by, claimed_at, completed_at, output
            ) VALUES (
              ${task.id},
              ${task.conferenceId},
              ${task.sessionId},
              ${task.targetUrl},
              ${task.title},
              ${status},
              ${task.priority},
              ${task.instructions},
              ${claimedBy},
              ${claimedAt},
              ${completedAt},
              ${output ? tx.json(output as unknown as postgres.JSONValue) : null}
            )
            ON CONFLICT(id) DO UPDATE SET
              conference_id=EXCLUDED.conference_id,
              session_id=EXCLUDED.session_id,
              target_url=EXCLUDED.target_url,
              title=EXCLUDED.title,
              priority=EXCLUDED.priority,
              instructions=EXCLUDED.instructions,
              status=EXCLUDED.status,
              claimed_by=EXCLUDED.claimed_by,
              claimed_at=EXCLUDED.claimed_at,
              completed_at=EXCLUDED.completed_at,
              output=EXCLUDED.output
          `;
        }

        for (const existing of existingTasks) {
          if (!incomingTaskIds.has(existing.id)) {
            await tx`DELETE FROM speaker_signal.research_tasks WHERE id = ${existing.id}`;
          }
        }

        const existingSessionRows = await tx`
          SELECT id FROM speaker_signal.conference_sessions WHERE conference_id = ${graph.conference.id}
        `;
        const existingSessions = existingSessionRows as unknown as SqlRow[];
        for (const sessionRow of existingSessions) {
          const sid = String(sessionRow.id);
          if (!incomingSessionIds.has(sid)) {
            await tx`DELETE FROM speaker_signal.conference_sessions WHERE id = ${sid}`;
          }
        }

        await tx`
          DELETE FROM speaker_signal.session_speakers
          WHERE session_id IN (SELECT id FROM speaker_signal.conference_sessions WHERE conference_id = ${graph.conference.id})
        `;

        for (const link of graph.sessionSpeakers) {
          await tx`
            INSERT INTO speaker_signal.session_speakers (
              session_id, speaker_id, role, evidence_url
            ) VALUES (
              ${link.sessionId},
              ${link.speakerId},
              ${link.role},
              ${link.evidenceUrl}
            )
          `;
        }

        await tx`
          INSERT INTO speaker_signal.ingestion_coverage (
            conference_id, expected_session_pages, fetched_session_pages, expected_sessions,
            extracted_sessions, expected_speaker_pages, fetched_speaker_pages,
            expected_indexed_speakers, extracted_indexed_speakers, structured_agenda_speakers,
            expected_description_only_speakers, description_only_speakers,
            expected_total_speakers, total_speakers,
            expected_research_tasks, extracted_research_tasks
          ) VALUES (
            ${graph.conference.id},
            ${graph.coverage.expectedSessionPages},
            ${graph.coverage.fetchedSessionPages},
            ${graph.coverage.expectedSessions},
            ${graph.coverage.extractedSessions},
            ${graph.coverage.expectedSpeakerPages},
            ${graph.coverage.fetchedSpeakerPages},
            ${graph.coverage.expectedIndexedSpeakers},
            ${graph.coverage.extractedIndexedSpeakers},
            ${graph.coverage.structuredAgendaSpeakers},
            ${graph.coverage.expectedDescriptionOnlySpeakers},
            ${graph.coverage.descriptionOnlySpeakers},
            ${graph.coverage.expectedTotalSpeakers},
            ${graph.coverage.totalSpeakers},
            ${graph.coverage.expectedResearchTasks},
            ${graph.coverage.extractedResearchTasks}
          )
          ON CONFLICT(conference_id) DO UPDATE SET
            expected_session_pages=EXCLUDED.expected_session_pages,
            fetched_session_pages=EXCLUDED.fetched_session_pages,
            expected_sessions=EXCLUDED.expected_sessions,
            extracted_sessions=EXCLUDED.extracted_sessions,
            expected_speaker_pages=EXCLUDED.expected_speaker_pages,
            fetched_speaker_pages=EXCLUDED.fetched_speaker_pages,
            expected_indexed_speakers=EXCLUDED.expected_indexed_speakers,
            extracted_indexed_speakers=EXCLUDED.extracted_indexed_speakers,
            structured_agenda_speakers=EXCLUDED.structured_agenda_speakers,
            expected_description_only_speakers=EXCLUDED.expected_description_only_speakers,
            description_only_speakers=EXCLUDED.description_only_speakers,
            expected_total_speakers=EXCLUDED.expected_total_speakers,
            total_speakers=EXCLUDED.total_speakers,
            expected_research_tasks=EXCLUDED.expected_research_tasks,
            extracted_research_tasks=EXCLUDED.extracted_research_tasks
        `;
      } else {
        // Base ConferenceGraph: clear intelligence-only state and derive sessions from speakers
        await tx`DELETE FROM speaker_signal.research_tasks WHERE conference_id = ${graph.conference.id}`;
        await tx`DELETE FROM speaker_signal.ingestion_coverage WHERE conference_id = ${graph.conference.id}`;

        const derivedSessionMap = new Map<string, { id: string; title: string }>();
        for (const speaker of graph.speakers) {
          const title = speaker.sessionTitle?.trim();
          if (title && !derivedSessionMap.has(title)) {
            derivedSessionMap.set(title, {
              id: derivedSessionId(graph.conference.id, title),
              title,
            });
          }
        }

        const derivedSessionIds = new Set(Array.from(derivedSessionMap.values()).map((s) => s.id));

        for (const session of derivedSessionMap.values()) {
          await tx`
            INSERT INTO speaker_signal.conference_sessions (
              id, conference_id, source_id, source_url, title, description,
              starts_at, ends_at, location, track, session_type
            ) VALUES (
              ${session.id},
              ${graph.conference.id},
              ${session.id},
              ${graph.conference.sourceUrl},
              ${session.title},
              '',
              ${graph.conference.startsAt},
              ${graph.conference.endsAt},
              ${graph.conference.location},
              'General',
              'Session'
            )
            ON CONFLICT(id) DO UPDATE SET
              title=EXCLUDED.title,
              source_url=EXCLUDED.source_url
          `;
        }

        const existingSessionRows = await tx`
          SELECT id FROM speaker_signal.conference_sessions WHERE conference_id = ${graph.conference.id}
        `;
        const existingSessions = existingSessionRows as unknown as SqlRow[];
        for (const sessionRow of existingSessions) {
          const sid = String(sessionRow.id);
          if (!derivedSessionIds.has(sid)) {
            await tx`DELETE FROM speaker_signal.conference_sessions WHERE id = ${sid}`;
          }
        }

        await tx`
          DELETE FROM speaker_signal.session_speakers
          WHERE session_id IN (SELECT id FROM speaker_signal.conference_sessions WHERE conference_id = ${graph.conference.id})
        `;

        for (const speaker of graph.speakers) {
          const title = speaker.sessionTitle?.trim();
          if (title) {
            const sid = derivedSessionId(graph.conference.id, title);
            await tx`
              INSERT INTO speaker_signal.session_speakers (
                session_id, speaker_id, role, evidence_url
              ) VALUES (
                ${sid},
                ${speaker.id},
                'Speaker',
                ${graph.conference.sourceUrl}
              )
              ON CONFLICT(session_id, speaker_id) DO NOTHING
            `;
          }
        }
      }
    });
  }

  async listConferences(): Promise<Conference[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT * FROM speaker_signal.conferences ORDER BY starts_at
    `;
    return (rows as unknown as SqlRow[]).map(mapConference);
  }

  async getConference(id: string): Promise<Conference | null> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT * FROM speaker_signal.conferences WHERE id = ${id}
    `;
    const sqlRows = rows as unknown as SqlRow[];
    return sqlRows.length ? mapConference(sqlRows[0]) : null;
  }

  async getSpeaker(id: string): Promise<Speaker | null> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT * FROM speaker_signal.speakers WHERE id = ${id}
    `;
    const sqlRows = rows as unknown as SqlRow[];
    return sqlRows.length ? mapSpeaker(sqlRows[0]) : null;
  }

  async listSpeakers(conferenceId?: string): Promise<Speaker[]> {
    await this.ensureInitialized();
    const rows = conferenceId
      ? await this.sql`
          SELECT * FROM speaker_signal.speakers
          WHERE conference_id = ${conferenceId}
          ORDER BY score DESC, name
        `
      : await this.sql`
          SELECT * FROM speaker_signal.speakers
          ORDER BY score DESC, name
        `;
    return (rows as unknown as SqlRow[]).map(mapSpeaker);
  }

  async listSequence(speakerId: string): Promise<SequenceStep[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT * FROM speaker_signal.sequence_steps
      WHERE speaker_id = ${speakerId}
      ORDER BY offset_days
    `;
    return (rows as unknown as SqlRow[]).map(mapSequence);
  }

  async listFunnelEvents(): Promise<FunnelEvent[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT * FROM speaker_signal.funnel_events ORDER BY occurred_at
    `;
    return (rows as unknown as SqlRow[]).map(mapEvent);
  }

  async advanceSpeaker(speakerId: string, targetStage: FunnelStage): Promise<FunnelEvent> {
    await this.ensureInitialized();
    const speaker = await this.getSpeaker(speakerId);
    if (!speaker) throw new Error("Speaker not found");

    const existingRows = await this.sql`
      SELECT * FROM speaker_signal.funnel_events WHERE speaker_id = ${speakerId}
    `;
    const existing = (existingRows as unknown as SqlRow[]).map(mapEvent);

    const current = existing.reduce<FunnelStage | null>((latest, event) => {
      if (!latest) return event.stage;
      return FUNNEL_STAGES.indexOf(event.stage) > FUNNEL_STAGES.indexOf(latest) ? event.stage : latest;
    }, null);

    const expected = current ? nextFunnelStage(current) : "identified";
    if (targetStage !== expected) {
      throw new Error(`Speaker can only advance to the next stage: ${expected ?? "complete"}`);
    }

    const occurredAt = new Date().toISOString();
    const event: FunnelEvent = {
      id: `${speakerId}:${targetStage}`,
      speakerId,
      stage: targetStage,
      occurredAt,
    };

    await this.sql`
      INSERT INTO speaker_signal.funnel_events (id, speaker_id, stage, occurred_at)
      VALUES (${event.id}, ${event.speakerId}, ${event.stage}, ${event.occurredAt})
    `;

    return event;
  }

  async listResearchTasks(options?: ListResearchTasksOptions): Promise<ResearchTask[]> {
    await this.ensureInitialized();
    const confFilter = options?.conferenceId ?? null;
    const statusFilter = options?.status ?? null;

    const rows = await this.sql`
      SELECT * FROM speaker_signal.research_tasks
      WHERE (${confFilter}::text IS NULL OR conference_id = ${confFilter})
        AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
      ORDER BY priority DESC, id ASC
    `;

    return (rows as unknown as SqlRow[]).map(mapResearchTask);
  }

  async claimResearchTask(agentId: string, conferenceId?: string): Promise<ResearchTask | null> {
    await this.ensureInitialized();
    if (!agentId || !agentId.trim()) {
      throw new Error("Agent ID is required");
    }

    return await this.sql.begin(async (tx) => {
      const confFilter = conferenceId ?? null;
      const rows = await tx`
        SELECT * FROM speaker_signal.research_tasks
        WHERE status = 'pending'
          AND (${confFilter}::text IS NULL OR conference_id = ${confFilter})
        ORDER BY priority DESC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      const sqlRows = rows as unknown as SqlRow[];
      if (sqlRows.length === 0) {
        return null;
      }

      const taskRow = sqlRows[0];
      const taskId = String(taskRow.id);
      const now = new Date().toISOString();

      const updatedRows = await tx`
        UPDATE speaker_signal.research_tasks
        SET status = 'in_progress', claimed_by = ${agentId}, claimed_at = ${now}
        WHERE id = ${taskId}
        RETURNING *
      `;

      return mapResearchTask((updatedRows as unknown as SqlRow[])[0]);
    });
  }

  async completeResearchTask(
    taskId: string,
    agentId: string,
    output: ResearchTaskOutput,
  ): Promise<ResearchTask> {
    await this.ensureInitialized();
    if (!taskId || !taskId.trim()) {
      throw new Error("Task ID is required");
    }
    if (!agentId || !agentId.trim()) {
      throw new Error("Agent ID is required");
    }

    return await this.sql.begin(async (tx) => {
      const rows = await tx`
        SELECT * FROM speaker_signal.research_tasks
        WHERE id = ${taskId}
        FOR UPDATE
      `;

      const sqlRows = rows as unknown as SqlRow[];
      if (sqlRows.length === 0) {
        throw new Error("Task not found");
      }

      const task = mapResearchTask(sqlRows[0]);
      if (task.claimedBy !== agentId) {
        throw new Error(`Task ${taskId} is not claimed by agent ${agentId}`);
      }

      if (task.status !== "in_progress") {
        throw new Error(`Task ${taskId} is not in progress (current status: ${task.status})`);
      }

      const now = new Date().toISOString();
      const updatedRows = await tx`
        UPDATE speaker_signal.research_tasks
        SET status = 'complete', completed_at = ${now}, output = ${tx.json(output as unknown as postgres.JSONValue)}
        WHERE id = ${taskId}
        RETURNING *
      `;

      return mapResearchTask((updatedRows as unknown as SqlRow[])[0]);
    });
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

export function createPostgresRepository(connectionString: string): PostgresConferenceRepository {
  try {
    return new PostgresConferenceRepository(connectionString);
  } catch {
    throw new Error("Invalid DATABASE_URL configuration");
  }
}
