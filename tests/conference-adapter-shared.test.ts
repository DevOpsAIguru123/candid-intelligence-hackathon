import { describe, expect, it } from "vitest";

import { assertCompleteConferenceGraph, buildSpeakerLifecycle } from "@/lib/adapters/shared";
import type { ConferenceIntelligenceGraph } from "@/lib/conference-intelligence";
import type { Conference, Speaker } from "@/lib/domain";

const conference: Conference = {
  id: "event-2027",
  name: "Event 2027",
  sourceUrl: "https://example.com/event",
  location: "Example City",
  startsAt: "2027-01-01T10:00:00.000Z",
  endsAt: "2027-01-01T12:00:00.000Z",
  sourceMode: "live",
  ingestionStatus: "complete",
  lastIngestedAt: "2026-08-08T12:00:00.000Z",
};

const speaker: Speaker = {
  id: "event-2027:speaker:1",
  conferenceId: conference.id,
  name: "Alex Rivera",
  title: "Chief Executive Officer",
  company: "Example Power",
  email: "",
  phone: "",
  linkedinUrl: "",
  profileUrl: "",
  sessionTitle: "Opening Keynote",
  score: 80,
  scoreReasons: [],
  dedupeKey: "alex rivera|example power",
};

function graph(): ConferenceIntelligenceGraph {
  const lifecycle = buildSpeakerLifecycle([speaker], conference);
  return {
    conference,
    speakers: [speaker],
    ...lifecycle,
    sessions: [{ id: "event-2027:session:1", conferenceId: conference.id, sourceId: "1", sourceUrl: "https://example.com/session/1", title: "Opening Keynote", description: "", startsAt: conference.startsAt, endsAt: conference.endsAt, location: "Room A", track: "Plenary", sessionType: "Keynote" }],
    sessionSpeakers: [{ sessionId: "event-2027:session:1", speakerId: speaker.id, role: "Speaker", evidenceUrl: "https://example.com/session/1" }],
    researchTasks: [{ id: "task:event-2027:1", conferenceId: conference.id, sessionId: "event-2027:session:1", targetUrl: "https://example.com/session/1", title: "Research Opening Keynote", status: "pending", priority: 100, instructions: "Use exact evidence.", claimedBy: null, claimedAt: null, completedAt: null, output: null }],
    coverage: { expectedSessionPages: 1, fetchedSessionPages: 1, expectedSessions: 1, extractedSessions: 1, expectedSpeakerPages: 1, fetchedSpeakerPages: 1, expectedIndexedSpeakers: 1, extractedIndexedSpeakers: 1, structuredAgendaSpeakers: 1, expectedDescriptionOnlySpeakers: 0, descriptionOnlySpeakers: 0, expectedTotalSpeakers: 1, totalSpeakers: 1, expectedResearchTasks: 1, extractedResearchTasks: 1 },
  };
}

describe("shared conference adapter contract", () => {
  it("accepts a complete graph and builds persisted speaker lifecycle records", () => {
    const value = graph();
    expect(assertCompleteConferenceGraph("fixture", value)).toBe(value);
    expect(value.sequences.length).toBeGreaterThan(0);
    expect(value.funnelEvents.map((event) => event.stage)).toEqual(["identified", "qualified"]);
  });

  it("fails closed on coverage drift", () => {
    const value = graph();
    value.coverage.expectedSessions = 2;
    expect(() => assertCompleteConferenceGraph("fixture", value)).toThrow(/sessions coverage mismatch/);
  });

  it("rejects duplicate relations and unresolved task references", () => {
    const duplicate = graph();
    duplicate.sessionSpeakers.push({ ...duplicate.sessionSpeakers[0] });
    expect(() => assertCompleteConferenceGraph("fixture", duplicate)).toThrow(/duplicate session-speaker/);

    const unresolved = graph();
    unresolved.researchTasks[0].sessionId = "missing";
    expect(() => assertCompleteConferenceGraph("fixture", unresolved)).toThrow(/research task has unresolved reference/);
  });
});
