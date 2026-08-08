import { FUNNEL_STAGES, type Conference, type ConferenceGraph, type FunnelEvent, type Speaker } from "@/lib/domain";
import { scoreSpeaker } from "@/lib/scoring";
import { buildSequence } from "@/lib/sequence";

const conference: Conference = {
  id: "gulf-coast-power-ai-forum-2026",
  name: "Gulf Coast Power & AI Forum 2026",
  sourceUrl: "demo://gulf-coast-power-ai-forum-2026",
  location: "Houston, Texas",
  startsAt: "2026-10-12T09:00:00-05:00",
  endsAt: "2026-10-13T17:00:00-05:00",
  sourceMode: "demo",
  ingestionStatus: "complete",
  lastIngestedAt: "2026-08-07T12:00:00.000Z",
};

const SPEAKER_SEEDS = [
  ["Maya Torres", "VP Engineering", "Vertex Arc Energy", "800 MW Behind-the-Meter Power for a Texas AI Campus"],
  ["Noah Bennett", "Head of Project Delivery", "Horizon Power Development", "Gas-to-Power Delivery for Data Centers"],
  ["Priya Nair", "Director of Infrastructure", "Blue Mesa Utilities", "ERCOT Grid Reliability and New AI Load"],
  ["Elliot Park", "VP Development", "Ember Grid Energy", "Interconnection Strategy for a 300 MW Houston Campus"],
  ["Lena Brooks", "Director of Construction", "ForgePoint Power", "Building Critical Power Infrastructure at Speed"],
  ["Owen Clarke", "Head of Engineering", "Redwood Energy Development", "Power Generation for Digital Infrastructure"],
  ["Sofia Ramirez", "Director of Project Delivery", "GulfLine Infrastructure", "Texas Energy Project Execution"],
  ["Marcus Chen", "Market Advisor", "Northwind Advisory", "The 2027 Energy Outlook"],
] as const;

/** Agenda slots, mirroring the shape a real conference site publishes. */
const SESSION_SEEDS = [
  ["Longhorn B", "Onsite Power", "Keynote", "Speaker", "2026-10-12T14:00:00.000Z"],
  ["Longhorn A", "Grid & Interconnection", "Session", "Speaker", "2026-10-12T15:30:00.000Z"],
  ["Yellow Rose Ballroom", "Onsite Power", "Session", "Speaker", "2026-10-12T17:00:00.000Z"],
  ["Longhorn B", "Grid & Interconnection", "Session", "Speaker", "2026-10-12T19:00:00.000Z"],
  ["Longhorn A", "Construction & Delivery", "Workshop", "Speaker", "2026-10-13T14:00:00.000Z"],
  ["Yellow Rose Ballroom", "Onsite Power", "Session", "Speaker", "2026-10-13T15:30:00.000Z"],
  ["Longhorn B", "Construction & Delivery", "Session", "Description Speaker", "2026-10-13T17:00:00.000Z"],
  ["Riverwalk Cantina", "No tracks found for this session", "Event Experiences and Networking", "Sponsor Speaker", "2026-10-13T19:00:00.000Z"],
] as const;

function createSpeakers(): Speaker[] {
  return SPEAKER_SEEDS.map(([name, title, company, sessionTitle], index) => {
    const [room, track, sessionType, role, startsAt] = SESSION_SEEDS[index % SESSION_SEEDS.length];
    const base: Speaker = {
      id: `demo-speaker-${index + 1}`,
      conferenceId: conference.id,
      name,
      title,
      company,
      sessionTitle,
      score: 0,
      scoreReasons: [],
      dedupeKey: `${name.toLowerCase().replace(/\s+/g, "-")}::${company.toLowerCase().replace(/\s+/g, "-")}`,
      sessions: [
        {
          id: `${conference.id}:session:${index + 1}`,
          title: sessionTitle,
          startsAt,
          endsAt: new Date(Date.parse(startsAt) + 45 * 60_000).toISOString(),
          room,
          track,
          sessionType,
          role,
          evidenceUrl: `demo://agenda/session-${index + 1}`,
        },
      ],
    };
    const scored = scoreSpeaker(base);
    return { ...base, score: scored.score, scoreReasons: scored.reasons };
  }).sort((left, right) => right.score - left.score);
}

function createFunnelEvents(speakers: Speaker[]): FunnelEvent[] {
  return speakers.flatMap((speaker, speakerIndex) => {
    const highestStageIndex = FUNNEL_STAGES.length - 1 - speakerIndex;
    return FUNNEL_STAGES.slice(0, highestStageIndex + 1).map((stage, stageIndex) => ({
      id: `${speaker.id}:${stage}`,
      speakerId: speaker.id,
      stage,
      occurredAt: new Date(Date.parse(conference.lastIngestedAt) + stageIndex * 86_400_000).toISOString(),
    }));
  });
}

export function getDemoConference(): ConferenceGraph {
  const speakers = createSpeakers();
  return {
    conference: {
      ...conference,
      timezone: "America/Chicago",
      coverage: {
        expectedSessions: 6,
        extractedSessions: 6,
        expectedTotalSpeakers: 8,
        totalSpeakers: 8,
        structuredAgendaSpeakers: 7,
        descriptionOnlySpeakers: 1,
      },
    },
    speakers,
    sequences: speakers
      .filter((speaker) => speaker.score >= 60)
      .flatMap((speaker) => buildSequence(speaker, conference)),
    funnelEvents: createFunnelEvents(speakers),
  };
}
