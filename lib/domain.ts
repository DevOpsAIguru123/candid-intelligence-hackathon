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
}

export interface Speaker {
  id: string;
  conferenceId: string;
  name: string;
  title: string;
  company: string;
  sessionTitle: string;
  score: number;
  scoreReasons: ScoreReason[];
  dedupeKey: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  companyDomain?: string;
}

export interface SpeakerCandidate {
  name: string;
  title: string;
  company: string;
  sessionTitle: string;
  profileUrl?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  companyDomain?: string;
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
