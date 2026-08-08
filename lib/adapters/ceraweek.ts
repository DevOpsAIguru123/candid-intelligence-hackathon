import { RESEARCH_TASK_OUTPUT_INSTRUCTIONS, type ConferenceIntelligenceGraph, type ConferenceSession, type ResearchTask, type SessionSpeaker } from "@/lib/conference-intelligence";
import type { Conference, Speaker } from "@/lib/domain";
import { normalizeSpeaker } from "@/lib/normalize";
import { scoreSpeaker } from "@/lib/scoring";
import { assertCompleteConferenceGraph, buildSpeakerLifecycle, fetchPublicConferenceText, type ConferenceAdapterDependencies } from "@/lib/adapters/shared";

const ROOT_URL = "https://www.ceraweek.com/en";
const AGENDA_URL = "https://www.ceraweek.com/en/program/agenda";
const API_URL = "https://www.ceraweek.com/content/events/api/servlets/resource.ZXZlbnRzZXJ2aWNlL3Nlc3Npb25zL3RyYWNrcz9ldmVudElkPTEwNjgmZ3JvdXBCeT10aW1lc2xvdCZub3NwZWFrZXJiaW8mbWluaWZ5PXRydWU=.json";

export interface CeraWeekDependencies extends ConferenceAdapterDependencies {
  agendaApiUrl?: string;
}

type SourceSpeaker = {
  id?: number;
  fullName?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  telephone?: string;
  linkedinUrl?: string;
  profileUrl?: string;
  speakerUrl?: string;
  facets?: { speakerRole?: Array<{ name?: string }> };
};
type SourceSession = { Id?: number; title?: string; utcStartDateTime?: string; utcEndDateTime?: string; roomLocation?: string; speakers?: SourceSpeaker[]; sessionProgramTypes?: Array<{ name?: string }>; facets?: { sessionType?: Array<{ name?: string }> } };
type SourceSlot = { sessions?: SourceSession[] };
type SourcePayload = { sessionTracks?: Array<{ day?: string; sessions?: SourceSlot[] }> };

function fail(message: string): never {
  throw new Error(`CERAWeek invariant violated: ${message}`);
}

function firstDirectValue(primary?: string, secondary?: string): string {
  if (primary?.trim()) return primary;
  return secondary?.trim() ? secondary : "";
}

export async function fetchCeraWeekConference(dependencies: CeraWeekDependencies = {}): Promise<ConferenceIntelligenceGraph> {
  const fetchText = dependencies.fetchText ?? ((url) => fetchPublicConferenceText("CERAWeek", url));
  let payload: SourcePayload;
  try {
    payload = JSON.parse(await fetchText(dependencies.agendaApiUrl ?? API_URL)) as SourcePayload;
  } catch (error) {
    throw new Error(`CERAWeek agenda API could not be fetched or parsed; the official site currently requires a rendered/browser fetch seam. ${error instanceof Error ? error.message : String(error)}`);
  }
  const rawSessions = (payload.sessionTracks ?? []).flatMap((track) => (track.sessions ?? []).flatMap((slot) => slot.sessions ?? []));
  if (rawSessions.length === 0) fail("agenda API contains no sessions");
  const sourceIds = rawSessions.map((session) => String(session.Id ?? ""));
  if (sourceIds.some((id) => !id) || new Set(sourceIds).size !== sourceIds.length) fail("session IDs are missing or duplicated");

  const conferenceId = "ceraweek-2026";
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  if (!Number.isFinite(Date.parse(now))) fail("now dependency returned an invalid date");
  const starts = rawSessions.map((session) => session.utcStartDateTime ?? "");
  const ends = rawSessions.map((session) => session.utcEndDateTime ?? "");
  if ([...starts, ...ends].some((value) => !Number.isFinite(Date.parse(value)))) fail("session timestamp is missing or invalid");
  const conference: Conference = { id: conferenceId, name: "CERAWeek 2026", sourceUrl: ROOT_URL, location: "Houston, Texas", startsAt: [...starts].sort()[0], endsAt: [...ends].sort().at(-1)!, sourceMode: "live", ingestionStatus: "complete", lastIngestedAt: now };
  const sessions: ConferenceSession[] = rawSessions.map((session) => {
    const sourceId = String(session.Id);
    const type = session.facets?.sessionType?.[0]?.name ?? "Session";
    return { id: `${conferenceId}:session:${sourceId}`, conferenceId, sourceId, sourceUrl: AGENDA_URL, title: session.title?.trim() || fail(`session ${sourceId} has no title`), description: "", startsAt: new Date(session.utcStartDateTime!).toISOString(), endsAt: new Date(session.utcEndDateTime!).toISOString(), location: session.roomLocation?.trim() ?? "", track: session.sessionProgramTypes?.[0]?.name?.trim() ?? "", sessionType: type };
  });

  const speakerById = new Map<number, Speaker>();
  const sessionSpeakers: SessionSpeaker[] = [];
  for (const raw of rawSessions) {
    for (const source of raw.speakers ?? []) {
      if (!source.id || !source.fullName?.trim()) fail(`session ${raw.Id} has a malformed speaker`);
      const normalized = normalizeSpeaker({
        name: source.fullName,
        title: source.title ?? "",
        company: source.company ?? "",
        email: source.email ?? "",
        phone: firstDirectValue(source.phone, source.telephone),
        linkedinUrl: source.linkedinUrl ?? "",
        profileUrl: firstDirectValue(source.profileUrl, source.speakerUrl),
        sessionTitle: raw.title ?? "",
      });
      let speaker = speakerById.get(source.id);
      if (!speaker) {
        const base: Speaker = { id: `${conferenceId}:speaker:${source.id}`, conferenceId, ...normalized, score: 0, scoreReasons: [] };
        const scored = scoreSpeaker(base);
        speaker = { ...base, score: scored.score, scoreReasons: scored.reasons };
      } else {
        speaker = {
          ...speaker,
          company: speaker.company || normalized.company,
          email: speaker.email || normalized.email,
          phone: speaker.phone || normalized.phone,
          linkedinUrl: speaker.linkedinUrl || normalized.linkedinUrl,
          profileUrl: speaker.profileUrl || normalized.profileUrl,
        };
      }
      speakerById.set(source.id, speaker);
      sessionSpeakers.push({ sessionId: `${conferenceId}:session:${raw.Id}`, speakerId: speaker.id, role: source.facets?.speakerRole?.[0]?.name ?? "Speaker", evidenceUrl: AGENDA_URL });
    }
  }
  const speakers = [...speakerById.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const researchTasks: ResearchTask[] = sessions.filter((session) => !/registration|reception|break|meal|lunch|welcome desk/i.test(`${session.sessionType} ${session.title}`)).map((session) => ({ id: `task:${conferenceId}:${session.sourceId}`, conferenceId, sessionId: session.id, targetUrl: session.sourceUrl, title: `Research ${session.title}`, status: "pending", priority: /keynote|plenary/i.test(session.sessionType) ? 100 : 80, instructions: `Investigate speaker claims, power projects, capacity, markets, timelines, and counterparties for session "${session.title}". Include exact evidence URLs. Do not infer missing details. ${RESEARCH_TASK_OUTPUT_INSTRUCTIONS}`, claimedBy: null, claimedAt: null, completedAt: null, output: null }));
  const lifecycle = buildSpeakerLifecycle(speakers, conference);
  return assertCompleteConferenceGraph("CERAWeek", { conference, speakers, ...lifecycle, sessions, sessionSpeakers, researchTasks, coverage: { expectedSessionPages: 1, fetchedSessionPages: 1, expectedSessions: sessions.length, extractedSessions: sessions.length, expectedSpeakerPages: 0, fetchedSpeakerPages: 0, expectedIndexedSpeakers: 0, extractedIndexedSpeakers: 0, structuredAgendaSpeakers: speakers.length, expectedDescriptionOnlySpeakers: 0, descriptionOnlySpeakers: 0, expectedTotalSpeakers: speakers.length, totalSpeakers: speakers.length, expectedResearchTasks: researchTasks.length, extractedResearchTasks: researchTasks.length } });
}
