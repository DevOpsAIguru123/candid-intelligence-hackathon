import { describe, expect, it } from "vitest";

import { fetchCeraWeekConference } from "@/lib/adapters/ceraweek";

const API_URL = "https://api.example.test/ceraweek/sessions.json";
const AGENDA_URL = "https://www.ceraweek.com/en/program/agenda";

const representativePayload = {
  sessionTracks: [
    {
      day: "2026-03-23",
      sessions: [
        {
          sessions: [
            {
              Id: 101,
              title: "Opening Plenary",
              utcStartDateTime: "2026-03-23T14:00:00.000Z",
              utcEndDateTime: "2026-03-23T15:00:00.000Z",
              roomLocation: "General Assembly",
              sessionProgramTypes: [{ name: "Executive Conference" }],
              facets: { sessionType: [{ name: "Plenary" }] },
              speakers: [
                {
                  id: 7,
                  fullName: " Alice Rivera ",
                  title: " President ",
                  company: " Meridian Energy ",
                  email: " CEO@MERIDIAN.EXAMPLE ",
                  linkedinUrl: " https://www.linkedin.com/in/alice-rivera ",
                  facets: { speakerRole: [{ name: "Chair" }] },
                },
                {
                  id: 8,
                  fullName: "Bob Lee",
                  title: "Analyst",
                  facets: { speakerRole: [{ name: "Speaker" }] },
                },
              ],
            },
          ],
        },
        {
          sessions: [
            {
              Id: 102,
              title: "Market Outlook",
              utcStartDateTime: "2026-03-23T16:00:00.000Z",
              utcEndDateTime: "2026-03-23T17:00:00.000Z",
              roomLocation: "Grand Ballroom",
              sessionProgramTypes: [{ name: "Executive Conference" }],
              facets: { sessionType: [{ name: "Panel" }] },
              speakers: [
                {
                  id: 7,
                  fullName: "Alice Rivera",
                  title: "Chief Executive Officer",
                  company: "Rival Power",
                  email: "replacement@example.test",
                  phone: " +1 713 555 0101 ",
                  linkedinUrl: "https://www.linkedin.com/in/replacement",
                  profileUrl: " https://www.ceraweek.com/en/speakers/alice-rivera ",
                  facets: { speakerRole: [{ name: "Panelist" }] },
                },
                {
                  id: 8,
                  fullName: "Bob Lee",
                  title: "Senior Analyst",
                  company: "Grid Labs",
                  facets: { speakerRole: [{ name: "Moderator" }] },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

async function fetchRepresentativeGraph() {
  const fetchedUrls: string[] = [];
  const graph = await fetchCeraWeekConference({
    agendaApiUrl: API_URL,
    now: () => new Date("2026-03-01T12:00:00.000Z"),
    fetchText: async (url) => {
      fetchedUrls.push(url);
      return JSON.stringify(representativePayload);
    },
  });

  return { graph, fetchedUrls };
}

describe("fetchCeraWeekConference adapter contract and behavior", () => {
  it("normalizes direct contacts and conservatively enriches repeated speakers", async () => {
    const { graph, fetchedUrls } = await fetchRepresentativeGraph();

    expect(fetchedUrls).toEqual([API_URL]);
    expect(graph.conference).toMatchObject({
      id: "ceraweek-2026",
      name: "CERAWeek 2026",
      sourceUrl: "https://www.ceraweek.com/en",
      startsAt: "2026-03-23T14:00:00.000Z",
      endsAt: "2026-03-23T17:00:00.000Z",
      lastIngestedAt: "2026-03-01T12:00:00.000Z",
    });

    expect(graph.sessions.map((session) => session.id)).toEqual([
      "ceraweek-2026:session:101",
      "ceraweek-2026:session:102",
    ]);
    expect(graph.sessions.map((session) => session.sourceId)).toEqual(["101", "102"]);
    expect(graph.sessions.every((session) => session.sourceUrl === AGENDA_URL)).toBe(true);

    expect(graph.speakers).toHaveLength(2);
    expect(graph.speakers.map((speaker) => speaker.id)).toEqual([
      "ceraweek-2026:speaker:7",
      "ceraweek-2026:speaker:8",
    ]);

    const alice = graph.speakers.find((speaker) => speaker.id === "ceraweek-2026:speaker:7");
    expect(alice).toMatchObject({
      name: "Alice Rivera",
      title: "President",
      company: "Meridian Energy",
      email: "ceo@meridian.example",
      phone: "+1 713 555 0101",
      linkedinUrl: "https://www.linkedin.com/in/alice-rivera",
      profileUrl: "https://www.ceraweek.com/en/speakers/alice-rivera",
      sessionTitle: "Opening Plenary",
      dedupeKey: "alice-rivera::meridian-energy",
    });

    const bob = graph.speakers.find((speaker) => speaker.id === "ceraweek-2026:speaker:8");
    expect(bob).toMatchObject({
      name: "Bob Lee",
      title: "Analyst",
      company: "Grid Labs",
      email: "",
      phone: "",
      linkedinUrl: "",
      profileUrl: "",
      sessionTitle: "Opening Plenary",
      dedupeKey: "bob-lee::",
    });

    expect(graph.sessionSpeakers).toEqual([
      {
        sessionId: "ceraweek-2026:session:101",
        speakerId: "ceraweek-2026:speaker:7",
        role: "Chair",
        evidenceUrl: AGENDA_URL,
      },
      {
        sessionId: "ceraweek-2026:session:101",
        speakerId: "ceraweek-2026:speaker:8",
        role: "Speaker",
        evidenceUrl: AGENDA_URL,
      },
      {
        sessionId: "ceraweek-2026:session:102",
        speakerId: "ceraweek-2026:speaker:7",
        role: "Panelist",
        evidenceUrl: AGENDA_URL,
      },
      {
        sessionId: "ceraweek-2026:session:102",
        speakerId: "ceraweek-2026:speaker:8",
        role: "Moderator",
        evidenceUrl: AGENDA_URL,
      },
    ]);

    expect(graph.researchTasks).toHaveLength(2);
    expect(graph.sequences).toHaveLength(0);
    expect(graph.funnelEvents).toHaveLength(2);
    expect(graph.coverage).toEqual({
      expectedSessionPages: 1,
      fetchedSessionPages: 1,
      expectedSessions: 2,
      extractedSessions: 2,
      expectedSpeakerPages: 0,
      fetchedSpeakerPages: 0,
      expectedIndexedSpeakers: 0,
      extractedIndexedSpeakers: 0,
      structuredAgendaSpeakers: 2,
      expectedDescriptionOnlySpeakers: 0,
      descriptionOnlySpeakers: 0,
      expectedTotalSpeakers: 2,
      totalSpeakers: 2,
      expectedResearchTasks: 2,
      extractedResearchTasks: 2,
    });
  });
});
