import type { ConferenceIntelligenceGraph } from "@/lib/conference-intelligence";
import type { Conference, FunnelEvent, Speaker } from "@/lib/domain";
import { FUNNEL_STAGES } from "@/lib/domain";
import { buildSequence } from "@/lib/sequence";
import { assertPublicHttpUrl } from "@/lib/url-safety";

export type ConferenceFetchText = (url: string) => Promise<string>;

export interface ConferenceAdapterDependencies {
  fetchText?: ConferenceFetchText;
  now?: () => Date;
}

export type ConferenceAdapter<
  Dependencies extends ConferenceAdapterDependencies = ConferenceAdapterDependencies,
> = (dependencies?: Dependencies) => Promise<ConferenceIntelligenceGraph>;

export function collapseWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function fetchPublicConferenceText(adapter: string, url: string): Promise<string> {
  const verifiedUrl = await assertPublicHttpUrl(url);
  const response = await fetch(verifiedUrl.toString(), {
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "SpeakerSignal/0.1 (+public-conference-research)" },
  });
  if (!response.ok) {
    throw new Error(`${adapter} fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function buildSpeakerLifecycle(speakers: Speaker[], conference: Conference) {
  const sequences = speakers
    .filter((speaker) => speaker.score >= 60)
    .flatMap((speaker) => buildSequence(speaker, conference));
  const funnelEvents: FunnelEvent[] = speakers.flatMap((speaker) => {
    const events: FunnelEvent[] = [
      {
        id: `${speaker.id}:identified`,
        speakerId: speaker.id,
        stage: FUNNEL_STAGES[0],
        occurredAt: conference.lastIngestedAt,
      },
    ];
    if (speaker.score >= 60) {
      events.push({
        id: `${speaker.id}:qualified`,
        speakerId: speaker.id,
        stage: FUNNEL_STAGES[1],
        occurredAt: conference.lastIngestedAt,
      });
    }
    return events;
  });
  return { sequences, funnelEvents };
}

export function assertCompleteConferenceGraph(
  adapter: string,
  graph: ConferenceIntelligenceGraph,
): ConferenceIntelligenceGraph {
  const fail = (message: string): never => {
    throw new Error(`${adapter} invariant violated: ${message}`);
  };
  const assertUnique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) fail(`duplicate ${label} id`);
  };

  if (graph.conference.ingestionStatus !== "complete") fail("graph is not complete");
  if (!Number.isFinite(Date.parse(graph.conference.startsAt))) fail("invalid conference start");
  if (!Number.isFinite(Date.parse(graph.conference.endsAt))) fail("invalid conference end");
  if (graph.conference.endsAt <= graph.conference.startsAt) fail("conference ends before it starts");

  assertUnique(graph.sessions.map(({ id }) => id), "session");
  assertUnique(graph.speakers.map(({ id }) => id), "speaker");
  assertUnique(graph.researchTasks.map(({ id }) => id), "research task");
  assertUnique(graph.sequences.map(({ id }) => id), "sequence");
  assertUnique(graph.funnelEvents.map(({ id }) => id), "funnel event");

  const sessionIds = new Set(graph.sessions.map(({ id }) => id));
  const speakerIds = new Set(graph.speakers.map(({ id }) => id));
  const relationIds = new Set<string>();
  for (const session of graph.sessions) {
    if (session.conferenceId !== graph.conference.id) fail("session has wrong conference id");
    if (!/^https?:\/\//i.test(session.sourceUrl)) fail("session has invalid source URL");
    if (!Number.isFinite(Date.parse(session.startsAt)) || !Number.isFinite(Date.parse(session.endsAt))) {
      fail("session has invalid timestamp");
    }
    if (session.endsAt <= session.startsAt) fail("session ends before it starts");
  }
  for (const speaker of graph.speakers) {
    if (speaker.conferenceId !== graph.conference.id) fail("speaker has wrong conference id");
    if (typeof speaker.email !== "string") fail("speaker has invalid email");
    if (typeof speaker.phone !== "string") fail("speaker has invalid phone");
    if (typeof speaker.linkedinUrl !== "string") fail("speaker has invalid LinkedIn URL");
    if (typeof speaker.profileUrl !== "string") fail("speaker has invalid profile URL");
    if (speaker.linkedinUrl && !/^https?:\/\//i.test(speaker.linkedinUrl)) {
      fail("speaker has invalid LinkedIn URL");
    }
    if (speaker.profileUrl && !/^https?:\/\//i.test(speaker.profileUrl)) {
      fail("speaker has invalid profile URL");
    }
  }
  for (const relation of graph.sessionSpeakers) {
    if (!sessionIds.has(relation.sessionId) || !speakerIds.has(relation.speakerId)) {
      fail("session-speaker relation has unresolved reference");
    }
    if (!/^https?:\/\//i.test(relation.evidenceUrl)) fail("relation has invalid evidence URL");
    const relationId = `${relation.sessionId}\u0000${relation.speakerId}`;
    if (relationIds.has(relationId)) fail("duplicate session-speaker relation");
    relationIds.add(relationId);
  }
  for (const task of graph.researchTasks) {
    if (task.conferenceId !== graph.conference.id || !sessionIds.has(task.sessionId)) {
      fail("research task has unresolved reference");
    }
  }

  const coveragePairs: Array<[number, number, string]> = [
    [graph.coverage.expectedSessionPages, graph.coverage.fetchedSessionPages, "session pages"],
    [graph.coverage.expectedSessions, graph.coverage.extractedSessions, "sessions"],
    [graph.coverage.expectedSpeakerPages, graph.coverage.fetchedSpeakerPages, "speaker pages"],
    [
      graph.coverage.expectedIndexedSpeakers,
      graph.coverage.extractedIndexedSpeakers,
      "indexed speakers",
    ],
    [
      graph.coverage.expectedDescriptionOnlySpeakers,
      graph.coverage.descriptionOnlySpeakers,
      "description-only speakers",
    ],
    [graph.coverage.expectedTotalSpeakers, graph.coverage.totalSpeakers, "total speakers"],
    [
      graph.coverage.expectedResearchTasks,
      graph.coverage.extractedResearchTasks,
      "research tasks",
    ],
  ];
  for (const [expected, actual, label] of coveragePairs) {
    if (!Number.isInteger(expected) || !Number.isInteger(actual) || expected !== actual) {
      fail(`${label} coverage mismatch: expected ${expected}, received ${actual}`);
    }
  }
  if (graph.coverage.extractedSessions !== graph.sessions.length) fail("session coverage drift");
  if (graph.coverage.totalSpeakers !== graph.speakers.length) fail("speaker coverage drift");
  if (graph.coverage.extractedResearchTasks !== graph.researchTasks.length) {
    fail("research task coverage drift");
  }

  return graph;
}
