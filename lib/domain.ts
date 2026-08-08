export type SourceMode = "live" | "firecrawl" | "demo";

export type IngestionStatus =
  | "idle"
  | "fetching"
  | "extracting"
  | "scoring"
  | "sequencing"
  | "complete"
  | "failed";

export type ScoreGroup = "seniority" | "function" | "company" | "topic" | "specificity";

export interface ScoreReason {
  group: ScoreGroup;
  points: number;
  reason: string;
  evidence: string;
}

export interface Conference {
  id: string;
  name: string;
  sourceUrl: string;
  location: string;
  startsAt: string;
  endsAt: string;
  sourceMode: SourceMode;
  ingestionStatus: IngestionStatus;
  lastIngestedAt: string;
  /** IANA zone for the venue. Session times are stored UTC and shown in this. */
  timezone?: string;
  coverage?: IngestionCoverage;
}

/**
 * How much of the published agenda we actually read. Lets the interface say
 * "48 of 48 sessions" instead of asking people to trust a number.
 */
export interface IngestionCoverage {
  expectedSessions: number;
  extractedSessions: number;
  expectedTotalSpeakers: number;
  totalSpeakers: number;
  structuredAgendaSpeakers: number;
  descriptionOnlySpeakers: number;
}

/**
 * A slot on the agenda a speaker appears in. One person can hold several.
 * `role` separates an earned speaking slot from a sponsor slot, and
 * `evidenceUrl` is the page we read it from.
 */
export interface SpeakerSession {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  room: string;
  track: string;
  sessionType: string;
  role: string;
  evidenceUrl: string;
}

export interface SpeakerContact {
  email: string;
  phone: string;
  linkedinUrl: string;
  profileUrl: string;
}

export interface Speaker {
  id: string;
  conferenceId: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  profileUrl: string;
  companyDomain?: string;
  sessionTitle: string;
  score: number;
  scoreReasons: ScoreReason[];
  dedupeKey: string;
  /** Populated once the agenda source exposes sessions; absent otherwise. */
  sessions?: SpeakerSession[];
}

export interface SpeakerCandidate {
  name: string;
  title: string;
  company: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  profileUrl?: string;
  companyDomain?: string;
  sessionTitle: string;
}

export interface ConferenceCandidate {
  name: string;
  sourceUrl: string;
  location: string;
  startsAt: string;
  endsAt: string;
}

export type SequenceStatus = "drafted" | "pending" | "complete";

export interface SequenceStep {
  id: string;
  speakerId: string;
  offsetDays: number;
  scheduledAt: string;
  channel: "email" | "in_person";
  status: SequenceStatus;
  subject: string;
  message: string;
}

export const FUNNEL_STAGES = [
  "identified",
  "qualified",
  "contacted",
  "replied",
  "meeting_scheduled",
  "met_at_event",
  "follow_up_sent",
  "conversation_booked",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelEvent {
  id: string;
  speakerId: string;
  stage: FunnelStage;
  occurredAt: string;
}

export interface ConferenceGraph {
  conference: Conference;
  speakers: Speaker[];
  sequences: SequenceStep[];
  funnelEvents: FunnelEvent[];
}
