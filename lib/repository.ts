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
import { nextFunnelStage } from "@/lib/funnel";

type SqlRow = Record<string, string | number | bigint | null>;

export interface SpeakerSignalRepository {
  replaceConference(graph: ConferenceGraph): void;
  listConferences(): Conference[];
  getConference(id: string): Conference | null;
  getSpeaker(id: string): Speaker | null;
  listSpeakers(conferenceId?: string): Speaker[];
  listSequence(speakerId: string): SequenceStep[];
  listFunnelEvents(): FunnelEvent[];
  advanceSpeaker(speakerId: string, targetStage: FunnelStage): FunnelEvent;
}

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

class SqliteSpeakerSignalRepository implements SpeakerSignalRepository {
  constructor(private readonly database: DatabaseSync) {
    database.exec("PRAGMA foreign_keys = ON");
    database.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_speakers_conference ON speakers(conference_id);
      CREATE INDEX IF NOT EXISTS idx_funnel_speaker ON funnel_events(speaker_id);
    `);
  }

  replaceConference(graph: ConferenceGraph): void {
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

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listConferences(): Conference[] {
    return (this.database.prepare("SELECT * FROM conferences ORDER BY starts_at").all() as SqlRow[]).map(
      mapConference,
    );
  }

  getConference(id: string): Conference | null {
    const row = this.database.prepare("SELECT * FROM conferences WHERE id = ?").get(id) as
      | SqlRow
      | undefined;
    return row ? mapConference(row) : null;
  }

  getSpeaker(id: string): Speaker | null {
    const row = this.database.prepare("SELECT * FROM speakers WHERE id = ?").get(id) as
      | SqlRow
      | undefined;
    return row ? mapSpeaker(row) : null;
  }

  listSpeakers(conferenceId?: string): Speaker[] {
    const rows = conferenceId
      ? this.database
          .prepare("SELECT * FROM speakers WHERE conference_id = ? ORDER BY score DESC, name")
          .all(conferenceId)
      : this.database.prepare("SELECT * FROM speakers ORDER BY score DESC, name").all();
    return (rows as SqlRow[]).map(mapSpeaker);
  }

  listSequence(speakerId: string): SequenceStep[] {
    return (
      this.database
        .prepare("SELECT * FROM sequence_steps WHERE speaker_id = ? ORDER BY offset_days")
        .all(speakerId) as SqlRow[]
    ).map(mapSequence);
  }

  listFunnelEvents(): FunnelEvent[] {
    return (this.database.prepare("SELECT * FROM funnel_events ORDER BY occurred_at").all() as SqlRow[]).map(
      mapEvent,
    );
  }

  advanceSpeaker(speakerId: string, targetStage: FunnelStage): FunnelEvent {
    if (!this.getSpeaker(speakerId)) throw new Error("Speaker not found");
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
}

export function createRepository(path = "data/speaker-signal.db"): SpeakerSignalRepository {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return new SqliteSpeakerSignalRepository(new DatabaseSync(path));
}

/**
 * Serverless deployments mount the bundle read-only, so the repository-relative
 * default cannot be opened for writing there. Only /tmp is writable, and it is
 * per-instance and ephemeral. An explicit DATABASE_PATH always wins.
 */
export function resolveDatabasePath(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.DATABASE_PATH?.trim();
  if (configured) return configured;
  if (env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) return "/tmp/speaker-signal.db";
  return "data/speaker-signal.db";
}

let defaultRepository: SpeakerSignalRepository | undefined;

export function getRepository(): SpeakerSignalRepository {
  defaultRepository ??= createRepository(resolveDatabasePath());
  return defaultRepository;
}
