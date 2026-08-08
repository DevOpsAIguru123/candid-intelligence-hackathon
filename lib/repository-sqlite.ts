import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

type SqlRow = Record<string, string | number | bigint | null>;

function mapConference(row: SqlRow): Conference {
  return {
    id: String(row.id),
    name: String(row.name),
    sourceUrl: String(row.source_url),
    location: String(row.location),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    sourceMode: String(row.source_mode) as Conference["sourceMode"],
    ingestionStatus: String(row.ingestion_status) as Conference["ingestionStatus"],
    lastIngestedAt: String(row.last_ingested_at),
  };
}

function mapSpeaker(row: SqlRow): Speaker {
  return {
    id: String(row.id),
    conferenceId: String(row.conference_id),
    name: String(row.name),
    title: String(row.title),
    company: String(row.company),
    sessionTitle: String(row.session_title),
    score: Number(row.score),
    scoreReasons: JSON.parse(String(row.score_reasons)) as Speaker["scoreReasons"],
    dedupeKey: String(row.dedupe_key),
  };
}

function mapSequence(row: SqlRow): SequenceStep {
  return {
    id: String(row.id),
    speakerId: String(row.speaker_id),
    offsetDays: Number(row.offset_days),
    scheduledAt: String(row.scheduled_at),
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
    occurredAt: String(row.occurred_at),
  };
}

function mapResearchTask(row: SqlRow): ResearchTask {
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
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    output: row.output ? researchTaskOutputSchema.parse(JSON.parse(String(row.output))) : null,
  };
}

function derivedSessionId(conferenceId: string, sessionTitle: string): string {
  const hash = createHash("sha256").update(sessionTitle).digest("hex").slice(0, 12);
  return `${conferenceId}:session:${hash}`;
}

export class SqliteConferenceRepository implements ConferenceRepository {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly database: DatabaseSync) {}

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
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS conferences (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_url TEXT NOT NULL,
        location TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        source_mode TEXT NOT NULL,
        ingestion_status TEXT NOT NULL,
        last_ingested_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS speakers (
        id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        session_title TEXT NOT NULL,
        score INTEGER NOT NULL,
        score_reasons TEXT NOT NULL,
        dedupe_key TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conference_sessions (
        id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        location TEXT NOT NULL,
        track TEXT NOT NULL,
        session_type TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_speakers (
        session_id TEXT NOT NULL REFERENCES conference_sessions(id) ON DELETE CASCADE,
        speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        evidence_url TEXT NOT NULL,
        PRIMARY KEY (session_id, speaker_id)
      );
      CREATE TABLE IF NOT EXISTS sequence_steps (
        id TEXT PRIMARY KEY,
        speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
        offset_days INTEGER NOT NULL,
        scheduled_at TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS funnel_events (
        id TEXT PRIMARY KEY,
        speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
        stage TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        UNIQUE(speaker_id, stage)
      );
      CREATE TABLE IF NOT EXISTS ingestion_coverage (
        conference_id TEXT PRIMARY KEY REFERENCES conferences(id) ON DELETE CASCADE,
        expected_session_pages INTEGER NOT NULL,
        fetched_session_pages INTEGER NOT NULL,
        expected_sessions INTEGER NOT NULL,
        extracted_sessions INTEGER NOT NULL,
        expected_speaker_pages INTEGER NOT NULL,
        fetched_speaker_pages INTEGER NOT NULL,
        expected_indexed_speakers INTEGER NOT NULL,
        extracted_indexed_speakers INTEGER NOT NULL,
        structured_agenda_speakers INTEGER NOT NULL,
        expected_description_only_speakers INTEGER NOT NULL DEFAULT 0,
        description_only_speakers INTEGER NOT NULL,
        expected_total_speakers INTEGER NOT NULL DEFAULT 0,
        total_speakers INTEGER NOT NULL,
        expected_research_tasks INTEGER NOT NULL DEFAULT 0,
        extracted_research_tasks INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS research_tasks (
        id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES conference_sessions(id) ON DELETE CASCADE,
        target_url TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        instructions TEXT NOT NULL,
        claimed_by TEXT,
        claimed_at TEXT,
        completed_at TEXT,
        output TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_speakers_conference ON speakers(conference_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_conference ON conference_sessions(conference_id);
      CREATE INDEX IF NOT EXISTS idx_funnel_speaker ON funnel_events(speaker_id);
      CREATE INDEX IF NOT EXISTS idx_research_tasks_conf ON research_tasks(conference_id);
      CREATE INDEX IF NOT EXISTS idx_research_tasks_status ON research_tasks(status);
    `);
    const existingCoverageColumns = new Set(
      (this.database.prepare("PRAGMA table_info(ingestion_coverage)").all() as SqlRow[]).map(
        (row) => String(row.name),
      ),
    );
    const coverageColumnMigrations: Record<string, string> = {
      expected_description_only_speakers:
        "ALTER TABLE ingestion_coverage ADD COLUMN expected_description_only_speakers INTEGER NOT NULL DEFAULT 0",
      expected_total_speakers:
        "ALTER TABLE ingestion_coverage ADD COLUMN expected_total_speakers INTEGER NOT NULL DEFAULT 0",
      expected_research_tasks:
        "ALTER TABLE ingestion_coverage ADD COLUMN expected_research_tasks INTEGER NOT NULL DEFAULT 0",
      extracted_research_tasks:
        "ALTER TABLE ingestion_coverage ADD COLUMN extracted_research_tasks INTEGER NOT NULL DEFAULT 0",
    };
    for (const [column, migration] of Object.entries(coverageColumnMigrations)) {
      if (!existingCoverageColumns.has(column)) {
        this.database.exec(migration);
      }
    }
    this.initialized = true;
  }

  async replaceConference(graph: ConferenceGraph | ConferenceIntelligenceGraph): Promise<void> {
    await this.ensureInitialized();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(`
          INSERT INTO conferences (
            id, name, source_url, location, starts_at, ends_at,
            source_mode, ingestion_status, last_ingested_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, source_url=excluded.source_url, location=excluded.location,
            starts_at=excluded.starts_at, ends_at=excluded.ends_at,
            source_mode=excluded.source_mode, ingestion_status=excluded.ingestion_status,
            last_ingested_at=excluded.last_ingested_at
        `)
        .run(
          graph.conference.id,
          graph.conference.name,
          graph.conference.sourceUrl,
          graph.conference.location,
          graph.conference.startsAt,
          graph.conference.endsAt,
          graph.conference.sourceMode,
          graph.conference.ingestionStatus,
          graph.conference.lastIngestedAt,
        );

      this.database.prepare("DELETE FROM speakers WHERE conference_id = ?").run(graph.conference.id);

      const insertSpeaker = this.database.prepare(`
        INSERT INTO speakers (
          id, conference_id, name, title, company, session_title,
          score, score_reasons, dedupe_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const speaker of graph.speakers) {
        insertSpeaker.run(
          speaker.id,
          speaker.conferenceId,
          speaker.name,
          speaker.title,
          speaker.company,
          speaker.sessionTitle,
          speaker.score,
          JSON.stringify(speaker.scoreReasons),
          speaker.dedupeKey,
        );
      }

      const insertSequence = this.database.prepare(`
        INSERT INTO sequence_steps (
          id, speaker_id, offset_days, scheduled_at, channel, status, subject, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const step of graph.sequences) {
        insertSequence.run(
          step.id,
          step.speakerId,
          step.offsetDays,
          step.scheduledAt,
          step.channel,
          step.status,
          step.subject,
          step.message,
        );
      }

      const insertEvent = this.database.prepare(`
        INSERT INTO funnel_events (id, speaker_id, stage, occurred_at) VALUES (?, ?, ?, ?)
      `);
      for (const event of graph.funnelEvents) {
        insertEvent.run(event.id, event.speakerId, event.stage, event.occurredAt);
      }

      if (isConferenceIntelligenceGraph(graph)) {
        const existingTasks = (
          this.database
            .prepare("SELECT * FROM research_tasks WHERE conference_id = ?")
            .all(graph.conference.id) as SqlRow[]
        ).map(mapResearchTask);
        const existingTaskMap = new Map(existingTasks.map((t) => [t.id, t]));

        const incomingTaskIds = new Set(graph.researchTasks.map((t) => t.id));
        const incomingSessionIds = new Set(graph.sessions.map((s) => s.id));

        const upsertSession = this.database.prepare(`
          INSERT INTO conference_sessions (
            id, conference_id, source_id, source_url, title, description,
            starts_at, ends_at, location, track, session_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conference_id=excluded.conference_id,
            source_id=excluded.source_id,
            source_url=excluded.source_url,
            title=excluded.title,
            description=excluded.description,
            starts_at=excluded.starts_at,
            ends_at=excluded.ends_at,
            location=excluded.location,
            track=excluded.track,
            session_type=excluded.session_type
        `);

        for (const session of graph.sessions) {
          upsertSession.run(
            session.id,
            session.conferenceId,
            session.sourceId,
            session.sourceUrl,
            session.title,
            session.description,
            session.startsAt,
            session.endsAt,
            session.location,
            session.track,
            session.sessionType,
          );
        }

        const upsertTask = this.database.prepare(`
          INSERT INTO research_tasks (
            id, conference_id, session_id, target_url, title, status, priority,
            instructions, claimed_by, claimed_at, completed_at, output
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conference_id=excluded.conference_id,
            session_id=excluded.session_id,
            target_url=excluded.target_url,
            title=excluded.title,
            priority=excluded.priority,
            instructions=excluded.instructions,
            status=excluded.status,
            claimed_by=excluded.claimed_by,
            claimed_at=excluded.claimed_at,
            completed_at=excluded.completed_at,
            output=excluded.output
        `);

        for (const task of graph.researchTasks) {
          const existing = existingTaskMap.get(task.id);
          const status = existing ? existing.status : task.status;
          const claimedBy = existing ? existing.claimedBy : task.claimedBy;
          const claimedAt = existing ? existing.claimedAt : task.claimedAt;
          const completedAt = existing ? existing.completedAt : task.completedAt;
          const output = existing ? existing.output : task.output;

          upsertTask.run(
            task.id,
            task.conferenceId,
            task.sessionId,
            task.targetUrl,
            task.title,
            status,
            task.priority,
            task.instructions,
            claimedBy,
            claimedAt,
            completedAt,
            output ? JSON.stringify(output) : null,
          );
        }

        for (const existing of existingTasks) {
          if (!incomingTaskIds.has(existing.id)) {
            this.database
              .prepare("DELETE FROM research_tasks WHERE id = ?")
              .run(existing.id);
          }
        }

        const existingSessions = (
          this.database
            .prepare("SELECT id FROM conference_sessions WHERE conference_id = ?")
            .all(graph.conference.id) as SqlRow[]
        );
        for (const sessionRow of existingSessions) {
          const sid = String(sessionRow.id);
          if (!incomingSessionIds.has(sid)) {
            this.database
              .prepare("DELETE FROM conference_sessions WHERE id = ?")
              .run(sid);
          }
        }

        this.database
          .prepare(
            "DELETE FROM session_speakers WHERE session_id IN (SELECT id FROM conference_sessions WHERE conference_id = ?)",
          )
          .run(graph.conference.id);

        const insertSessionSpeaker = this.database.prepare(`
          INSERT INTO session_speakers (session_id, speaker_id, role, evidence_url)
          VALUES (?, ?, ?, ?)
        `);
        for (const link of graph.sessionSpeakers) {
          insertSessionSpeaker.run(link.sessionId, link.speakerId, link.role, link.evidenceUrl);
        }

        this.database
          .prepare(`
            INSERT INTO ingestion_coverage (
              conference_id, expected_session_pages, fetched_session_pages, expected_sessions,
              extracted_sessions, expected_speaker_pages, fetched_speaker_pages,
              expected_indexed_speakers, extracted_indexed_speakers, structured_agenda_speakers,
              expected_description_only_speakers, description_only_speakers,
              expected_total_speakers, total_speakers,
              expected_research_tasks, extracted_research_tasks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(conference_id) DO UPDATE SET
              expected_session_pages=excluded.expected_session_pages,
              fetched_session_pages=excluded.fetched_session_pages,
              expected_sessions=excluded.expected_sessions,
              extracted_sessions=excluded.extracted_sessions,
              expected_speaker_pages=excluded.expected_speaker_pages,
              fetched_speaker_pages=excluded.fetched_speaker_pages,
              expected_indexed_speakers=excluded.expected_indexed_speakers,
              extracted_indexed_speakers=excluded.extracted_indexed_speakers,
              structured_agenda_speakers=excluded.structured_agenda_speakers,
              expected_description_only_speakers=excluded.expected_description_only_speakers,
              description_only_speakers=excluded.description_only_speakers,
              expected_total_speakers=excluded.expected_total_speakers,
              total_speakers=excluded.total_speakers,
              expected_research_tasks=excluded.expected_research_tasks,
              extracted_research_tasks=excluded.extracted_research_tasks
          `)
          .run(
            graph.conference.id,
            graph.coverage.expectedSessionPages,
            graph.coverage.fetchedSessionPages,
            graph.coverage.expectedSessions,
            graph.coverage.extractedSessions,
            graph.coverage.expectedSpeakerPages,
            graph.coverage.fetchedSpeakerPages,
            graph.coverage.expectedIndexedSpeakers,
            graph.coverage.extractedIndexedSpeakers,
            graph.coverage.structuredAgendaSpeakers,
            graph.coverage.expectedDescriptionOnlySpeakers,
            graph.coverage.descriptionOnlySpeakers,
            graph.coverage.expectedTotalSpeakers,
            graph.coverage.totalSpeakers,
            graph.coverage.expectedResearchTasks,
            graph.coverage.extractedResearchTasks,
          );
      } else {
        // Base ConferenceGraph: clear intelligence-only state and derive sessions from speakers
        this.database
          .prepare("DELETE FROM research_tasks WHERE conference_id = ?")
          .run(graph.conference.id);
        this.database
          .prepare("DELETE FROM ingestion_coverage WHERE conference_id = ?")
          .run(graph.conference.id);

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

        const upsertSession = this.database.prepare(`
          INSERT INTO conference_sessions (
            id, conference_id, source_id, source_url, title, description,
            starts_at, ends_at, location, track, session_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            source_url=excluded.source_url
        `);

        for (const session of derivedSessionMap.values()) {
          upsertSession.run(
            session.id,
            graph.conference.id,
            session.id,
            graph.conference.sourceUrl,
            session.title,
            "",
            graph.conference.startsAt,
            graph.conference.endsAt,
            graph.conference.location,
            "General",
            "Session",
          );
        }

        const existingSessions = (
          this.database
            .prepare("SELECT id FROM conference_sessions WHERE conference_id = ?")
            .all(graph.conference.id) as SqlRow[]
        );
        for (const sessionRow of existingSessions) {
          const sid = String(sessionRow.id);
          if (!derivedSessionIds.has(sid)) {
            this.database
              .prepare("DELETE FROM conference_sessions WHERE id = ?")
              .run(sid);
          }
        }

        this.database
          .prepare(
            "DELETE FROM session_speakers WHERE session_id IN (SELECT id FROM conference_sessions WHERE conference_id = ?)",
          )
          .run(graph.conference.id);

        const insertSessionSpeaker = this.database.prepare(`
          INSERT INTO session_speakers (session_id, speaker_id, role, evidence_url)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(session_id, speaker_id) DO NOTHING
        `);

        for (const speaker of graph.speakers) {
          const title = speaker.sessionTitle?.trim();
          if (title) {
            const sid = derivedSessionId(graph.conference.id, title);
            insertSessionSpeaker.run(sid, speaker.id, "Speaker", graph.conference.sourceUrl);
          }
        }
      }

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async listConferences(): Promise<Conference[]> {
    await this.ensureInitialized();
    return (this.database.prepare("SELECT * FROM conferences ORDER BY starts_at").all() as SqlRow[]).map(
      mapConference,
    );
  }

  async getConference(id: string): Promise<Conference | null> {
    await this.ensureInitialized();
    const row = this.database.prepare("SELECT * FROM conferences WHERE id = ?").get(id) as
      | SqlRow
      | undefined;
    return row ? mapConference(row) : null;
  }

  async getSpeaker(id: string): Promise<Speaker | null> {
    await this.ensureInitialized();
    const row = this.database.prepare("SELECT * FROM speakers WHERE id = ?").get(id) as
      | SqlRow
      | undefined;
    return row ? mapSpeaker(row) : null;
  }

  async listSpeakers(conferenceId?: string): Promise<Speaker[]> {
    await this.ensureInitialized();
    const rows = conferenceId
      ? this.database
          .prepare("SELECT * FROM speakers WHERE conference_id = ? ORDER BY score DESC, name")
          .all(conferenceId)
      : this.database.prepare("SELECT * FROM speakers ORDER BY score DESC, name").all();
    return (rows as SqlRow[]).map(mapSpeaker);
  }

  async listSequence(speakerId: string): Promise<SequenceStep[]> {
    await this.ensureInitialized();
    return (
      this.database
        .prepare("SELECT * FROM sequence_steps WHERE speaker_id = ? ORDER BY offset_days")
        .all(speakerId) as SqlRow[]
    ).map(mapSequence);
  }

  async listFunnelEvents(): Promise<FunnelEvent[]> {
    await this.ensureInitialized();
    return (this.database.prepare("SELECT * FROM funnel_events ORDER BY occurred_at").all() as SqlRow[]).map(
      mapEvent,
    );
  }

  async advanceSpeaker(speakerId: string, targetStage: FunnelStage): Promise<FunnelEvent> {
    await this.ensureInitialized();
    const speaker = await this.getSpeaker(speakerId);
    if (!speaker) throw new Error("Speaker not found");

    const existing = (
      this.database.prepare("SELECT * FROM funnel_events WHERE speaker_id = ?").all(speakerId) as SqlRow[]
    ).map(mapEvent);

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

    this.database
      .prepare("INSERT INTO funnel_events (id, speaker_id, stage, occurred_at) VALUES (?, ?, ?, ?)")
      .run(event.id, event.speakerId, event.stage, event.occurredAt);

    return event;
  }

  async listResearchTasks(options?: ListResearchTasksOptions): Promise<ResearchTask[]> {
    await this.ensureInitialized();
    let sql = "SELECT * FROM research_tasks";
    const params: string[] = [];
    const conditions: string[] = [];

    if (options?.conferenceId) {
      conditions.push("conference_id = ?");
      params.push(options.conferenceId);
    }
    if (options?.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY priority DESC, id ASC";

    const rows = this.database.prepare(sql).all(...params) as SqlRow[];
    return rows.map(mapResearchTask);
  }

  async claimResearchTask(agentId: string, conferenceId?: string): Promise<ResearchTask | null> {
    await this.ensureInitialized();
    if (!agentId || !agentId.trim()) {
      throw new Error("Agent ID is required");
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      let sql = "SELECT * FROM research_tasks WHERE status = 'pending'";
      const params: string[] = [];
      if (conferenceId) {
        sql += " AND conference_id = ?";
        params.push(conferenceId);
      }
      sql += " ORDER BY priority DESC, id ASC LIMIT 1";

      const row = this.database.prepare(sql).get(...params) as SqlRow | undefined;
      if (!row) {
        this.database.exec("COMMIT");
        return null;
      }

      const now = new Date().toISOString();
      this.database
        .prepare(
          "UPDATE research_tasks SET status = 'in_progress', claimed_by = ?, claimed_at = ? WHERE id = ?",
        )
        .run(agentId, now, String(row.id));

      const updatedRow = this.database
        .prepare("SELECT * FROM research_tasks WHERE id = ?")
        .get(String(row.id)) as SqlRow;

      this.database.exec("COMMIT");
      return mapResearchTask(updatedRow);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
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

    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT * FROM research_tasks WHERE id = ?")
        .get(taskId) as SqlRow | undefined;

      if (!row) {
        throw new Error("Task not found");
      }

      const task = mapResearchTask(row);
      if (task.claimedBy !== agentId) {
        throw new Error(`Task ${taskId} is not claimed by agent ${agentId}`);
      }

      if (task.status !== "in_progress") {
        throw new Error(`Task ${taskId} is not in progress (current status: ${task.status})`);
      }

      const now = new Date().toISOString();
      const outputJson = JSON.stringify(output);

      this.database
        .prepare(
          "UPDATE research_tasks SET status = 'complete', completed_at = ?, output = ? WHERE id = ?",
        )
        .run(now, outputJson, taskId);

      const updatedRow = this.database
        .prepare("SELECT * FROM research_tasks WHERE id = ?")
        .get(taskId) as SqlRow;

      this.database.exec("COMMIT");
      return mapResearchTask(updatedRow);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

export function createSqliteRepository(path = "data/speaker-signal.db"): SqliteConferenceRepository {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return new SqliteConferenceRepository(new DatabaseSync(path));
}
