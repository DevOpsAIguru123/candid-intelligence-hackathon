import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ApprovalStatus,
  AttendanceStatus,
  DraftApproval,
  EventAttendance,
  MeetListEntry,
} from "@/lib/planning";
import { resolveDatabasePath } from "@/lib/repository";

/**
 * Planning state lives in its own tables and its own connection so the
 * ingestion repository — which replaces whole conference graphs atomically —
 * never deletes a human decision as a side effect of a re-analysis.
 */

type SqlRow = Record<string, string | number | bigint | null>;

export interface PlanningRepository {
  getAttendance(conferenceId: string): EventAttendance;
  setAttendance(conferenceId: string, status: AttendanceStatus): EventAttendance;
  listAttendance(): EventAttendance[];
  listMeetList(conferenceId?: string): MeetListEntry[];
  isOnMeetList(speakerId: string): boolean;
  addToMeetList(speakerId: string, conferenceId: string, note?: string): MeetListEntry;
  setMeetNote(speakerId: string, note: string): MeetListEntry | null;
  removeFromMeetList(speakerId: string): void;
  listApprovals(speakerId?: string): DraftApproval[];
  getApproval(stepId: string): DraftApproval | null;
  setApproval(
    stepId: string,
    speakerId: string,
    status: ApprovalStatus,
    note?: string,
  ): DraftApproval;
}

function mapAttendance(row: SqlRow): EventAttendance {
  return {
    conferenceId: String(row.conference_id),
    status: String(row.status) as AttendanceStatus,
    updatedAt: String(row.updated_at),
  };
}

function mapMeet(row: SqlRow): MeetListEntry {
  return {
    speakerId: String(row.speaker_id),
    conferenceId: String(row.conference_id),
    note: String(row.note ?? ""),
    addedAt: String(row.added_at),
  };
}

function mapApproval(row: SqlRow): DraftApproval {
  return {
    stepId: String(row.step_id),
    speakerId: String(row.speaker_id),
    status: String(row.status) as ApprovalStatus,
    note: String(row.note ?? ""),
    decidedAt: String(row.decided_at),
  };
}

class SqlitePlanningRepository implements PlanningRepository {
  constructor(private readonly database: DatabaseSync) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS event_attendance (
        conference_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meet_list (
        speaker_id TEXT PRIMARY KEY,
        conference_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        added_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS draft_approvals (
        step_id TEXT PRIMARY KEY,
        speaker_id TEXT NOT NULL,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        decided_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_meet_conference ON meet_list(conference_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_speaker ON draft_approvals(speaker_id);
    `);
  }

  getAttendance(conferenceId: string): EventAttendance {
    const row = this.database
      .prepare("SELECT * FROM event_attendance WHERE conference_id = ?")
      .get(conferenceId) as SqlRow | undefined;
    return row
      ? mapAttendance(row)
      : { conferenceId, status: "undecided", updatedAt: "" };
  }

  setAttendance(conferenceId: string, status: AttendanceStatus): EventAttendance {
    const updatedAt = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO event_attendance (conference_id, status, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(conference_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
      `)
      .run(conferenceId, status, updatedAt);
    return { conferenceId, status, updatedAt };
  }

  listAttendance(): EventAttendance[] {
    return (
      this.database.prepare("SELECT * FROM event_attendance").all() as SqlRow[]
    ).map(mapAttendance);
  }

  listMeetList(conferenceId?: string): MeetListEntry[] {
    const rows = conferenceId
      ? this.database
          .prepare("SELECT * FROM meet_list WHERE conference_id = ? ORDER BY added_at")
          .all(conferenceId)
      : this.database.prepare("SELECT * FROM meet_list ORDER BY added_at").all();
    return (rows as SqlRow[]).map(mapMeet);
  }

  isOnMeetList(speakerId: string): boolean {
    return Boolean(
      this.database.prepare("SELECT 1 FROM meet_list WHERE speaker_id = ?").get(speakerId),
    );
  }

  addToMeetList(speakerId: string, conferenceId: string, note = ""): MeetListEntry {
    const addedAt = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO meet_list (speaker_id, conference_id, note, added_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(speaker_id) DO UPDATE SET conference_id = excluded.conference_id
      `)
      .run(speakerId, conferenceId, note, addedAt);
    return this.listMeetList().find((entry) => entry.speakerId === speakerId) ?? {
      speakerId,
      conferenceId,
      note,
      addedAt,
    };
  }

  setMeetNote(speakerId: string, note: string): MeetListEntry | null {
    this.database.prepare("UPDATE meet_list SET note = ? WHERE speaker_id = ?").run(note, speakerId);
    const row = this.database
      .prepare("SELECT * FROM meet_list WHERE speaker_id = ?")
      .get(speakerId) as SqlRow | undefined;
    return row ? mapMeet(row) : null;
  }

  removeFromMeetList(speakerId: string): void {
    this.database.prepare("DELETE FROM meet_list WHERE speaker_id = ?").run(speakerId);
  }

  listApprovals(speakerId?: string): DraftApproval[] {
    const rows = speakerId
      ? this.database.prepare("SELECT * FROM draft_approvals WHERE speaker_id = ?").all(speakerId)
      : this.database.prepare("SELECT * FROM draft_approvals").all();
    return (rows as SqlRow[]).map(mapApproval);
  }

  getApproval(stepId: string): DraftApproval | null {
    const row = this.database
      .prepare("SELECT * FROM draft_approvals WHERE step_id = ?")
      .get(stepId) as SqlRow | undefined;
    return row ? mapApproval(row) : null;
  }

  setApproval(
    stepId: string,
    speakerId: string,
    status: ApprovalStatus,
    note = "",
  ): DraftApproval {
    const decidedAt = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO draft_approvals (step_id, speaker_id, status, note, decided_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(step_id) DO UPDATE SET
          status = excluded.status, note = excluded.note, decided_at = excluded.decided_at
      `)
      .run(stepId, speakerId, status, note, decidedAt);
    return { stepId, speakerId, status, note, decidedAt };
  }
}

export function createPlanningRepository(path = "data/speaker-signal.db"): PlanningRepository {
  if (path !== ":memory:") {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // Directory creation ignored in container/serverless environments
    }
  }
  return new SqlitePlanningRepository(new DatabaseSync(path));
}

let defaultPlanningRepository: PlanningRepository | undefined;

export function getPlanningRepository(): PlanningRepository {
  defaultPlanningRepository ??= createPlanningRepository(resolveDatabasePath());
  return defaultPlanningRepository;
}
