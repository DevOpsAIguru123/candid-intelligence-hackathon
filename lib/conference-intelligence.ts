import { z } from "zod";

import type { ConferenceGraph } from "@/lib/domain";

export interface ConferenceSession {
  id: string;
  conferenceId: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  track: string;
  sessionType: string;
}

export interface SessionSpeaker {
  sessionId: string;
  speakerId: string;
  role: string;
  evidenceUrl: string;
}

export type ResearchTaskStatus = "pending" | "in_progress" | "complete" | "failed";

export const RESEARCH_FINDING_CATEGORIES = [
  "speaker_claim",
  "power_project",
  "capacity",
  "geographic_market",
  "deployment_timeline",
  "counterparty",
] as const;

const researchFindingSchema = z
  .object({
    category: z.enum(RESEARCH_FINDING_CATEGORIES),
    statement: z.string().trim().min(1).max(4_000),
    attribution: z.string().trim().min(1).max(2_000),
    evidenceUrl: z
      .string()
      .url()
      .regex(/^https?:\/\//i, "Evidence URL must use HTTP or HTTPS"),
    evidenceQuote: z.string().trim().min(1).max(8_000),
  })
  .strict();

export const researchTaskOutputSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    summary: z.string().trim().min(1).max(4_000),
    findings: z.array(researchFindingSchema).max(100),
    unknowns: z.array(z.string().trim().min(1).max(2_000)).max(100),
  })
  .strict()
  .refine((output) => output.findings.length > 0 || output.unknowns.length > 0, {
    message: "At least one finding or unknown is required",
  });

export type ResearchTaskOutput = z.infer<typeof researchTaskOutputSchema>;

export const RESEARCH_TASK_OUTPUT_INSTRUCTIONS =
  'Return JSON only with schemaVersion "1.0", a non-empty summary, findings[], and unknowns[]. Each finding must contain category, statement, attribution, evidenceUrl, and a verbatim evidenceQuote. Valid categories: speaker_claim, power_project, capacity, geographic_market, deployment_timeline, counterparty. Put unsupported requested facts in unknowns; never infer.';

export interface ResearchTask {
  id: string;
  conferenceId: string;
  sessionId: string;
  targetUrl: string;
  title: string;
  status: ResearchTaskStatus;
  priority: number;
  instructions: string;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  output: ResearchTaskOutput | null;
}

export interface IngestionCoverage {
  expectedSessionPages: number;
  fetchedSessionPages: number;
  expectedSessions: number;
  extractedSessions: number;
  expectedSpeakerPages: number;
  fetchedSpeakerPages: number;
  expectedIndexedSpeakers: number;
  extractedIndexedSpeakers: number;
  structuredAgendaSpeakers: number;
  expectedDescriptionOnlySpeakers: number;
  descriptionOnlySpeakers: number;
  expectedTotalSpeakers: number;
  totalSpeakers: number;
  expectedResearchTasks: number;
  extractedResearchTasks: number;
}

export interface ConferenceIntelligenceGraph extends ConferenceGraph {
  sessions: ConferenceSession[];
  sessionSpeakers: SessionSpeaker[];
  researchTasks: ResearchTask[];
  coverage: IngestionCoverage;
}

export function isConferenceIntelligenceGraph(
  graph: ConferenceGraph | ConferenceIntelligenceGraph,
): graph is ConferenceIntelligenceGraph {
  return (
    "sessions" in graph &&
    "sessionSpeakers" in graph &&
    "researchTasks" in graph &&
    "coverage" in graph
  );
}
