import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fetchDtechConference } from "@/lib/adapters/dtech";

const rootHtml = readFileSync(join(__dirname, "fixtures/dtech/root.html"), "utf8");
const agendaHtml = readFileSync(join(__dirname, "fixtures/dtech/agenda.html"), "utf8");

const ROOT_URL = "https://dtech-root.example.test/";
const AGENDA_URL = "https://dtech-agenda.example.test/";

async function fetchFixtureGraph(scheduleHtml = agendaHtml) {
  const fetchedUrls: string[] = [];
  const responses: Record<string, string> = {
    [ROOT_URL]: rootHtml,
    [AGENDA_URL]: scheduleHtml,
  };

  const graph = await fetchDtechConference({
    rootUrl: ROOT_URL,
    agendaUrl: AGENDA_URL,
    now: () => new Date("2026-05-12T12:00:00.000Z"),
    fetchText: async (url) => {
      fetchedUrls.push(url);
      const response = responses[url];
      if (!response) throw new Error(`404: Unmapped URL ${url}`);
      return response;
    },
  });

  return { graph, fetchedUrls };
}

describe("fetchDtechConference adapter contract and behavior", () => {
  it("builds a deterministic graph from the ASP.events agenda", async () => {
    const { graph, fetchedUrls } = await fetchFixtureGraph();

    expect(graph.conference).toMatchObject({
      id: "dtech-data-centers-and-ai-2026-2026-05-12",
      name: "DTECH Data Centers & AI 2026",
      sourceUrl: "https://dtech-events.com/data-ai",
      location: "DoubleTree Resort by Hilton Hotel Paradise Valley Scottsdale, AZ",
      startsAt: "2026-05-12T07:00:00.000Z",
      endsAt: "2026-05-13T20:45:00.000Z",
      sourceMode: "live",
      ingestionStatus: "complete",
      lastIngestedAt: "2026-05-12T12:00:00.000Z",
    });

    expect(graph.sessions).toHaveLength(3);
    const registration = graph.sessions.find((session) => session.title === "Registration Open");
    const keynote = graph.sessions.find((session) => session.title === "Opening Keynote");
    const deepDive = graph.sessions.find((session) => session.title === "Grid Readiness Deep Dive");

    expect(registration).toMatchObject({
      sourceId: "registration-open:2026-05-12:0730",
      sourceUrl: AGENDA_URL,
      startsAt: "2026-05-12T14:30:00.000Z",
      endsAt: "2026-05-12T15:00:00.000Z",
      location: "Grand Ballroom Foyer",
      sessionType: "Logistics",
    });
    expect(keynote).toMatchObject({
      sourceId: "grid-readiness:2026-05-12:0800",
      startsAt: "2026-05-12T15:00:00.000Z",
      endsAt: "2026-05-12T16:00:00.000Z",
      location: "Grand Ballroom",
      sessionType: "Keynote",
    });
    expect(deepDive).toMatchObject({
      sourceId: "grid-readiness:2026-05-13:1300",
      startsAt: "2026-05-13T20:00:00.000Z",
      endsAt: "2026-05-13T20:45:00.000Z",
      location: "Forum",
      sessionType: "Session",
    });
    expect(keynote?.id).not.toBe(deepDive?.id);
    for (const session of graph.sessions) {
      expect(Date.parse(session.startsAt)).toBeGreaterThanOrEqual(
        Date.parse(graph.conference.startsAt),
      );
      expect(Date.parse(session.endsAt)).toBeLessThanOrEqual(Date.parse(graph.conference.endsAt));
    }

    expect(graph.speakers).toHaveLength(2);
    const alex = graph.speakers.find((speaker) => speaker.name === "Alex Rivera");
    const sam = graph.speakers.find((speaker) => speaker.name === "Sam Lee");
    expect(alex).toMatchObject({
      id: "dtech-data-centers-and-ai-2026-2026-05-12:speaker:alex-rivera",
      title: "Chief Grid Officer",
      company: "Example Utility",
      sessionTitle: "Opening Keynote",
    });
    expect(sam).toMatchObject({
      title: "Director, AI Infrastructure",
      company: "Example Labs",
    });

    expect(graph.sessionSpeakers).toHaveLength(3);
    expect(graph.sessionSpeakers.filter((relation) => relation.speakerId === alex?.id)).toHaveLength(2);
    expect(graph.sessionSpeakers.find((relation) => relation.speakerId === sam?.id)).toMatchObject({
      sessionId: keynote?.id,
      role: "Moderator",
      evidenceUrl: AGENDA_URL,
    });

    expect(graph.researchTasks).toHaveLength(2);
    expect(graph.researchTasks.some((task) => task.sessionId === registration?.id)).toBe(false);
    expect(graph.researchTasks.find((task) => task.sessionId === keynote?.id)).toMatchObject({
      priority: 100,
      targetUrl: AGENDA_URL,
    });
    expect(graph.researchTasks.find((task) => task.sessionId === deepDive?.id)?.priority).toBe(80);
    for (const task of graph.researchTasks) {
      expect(task.instructions).toContain("Include exact evidence URLs. Do not infer missing details.");
    }

    expect(graph.coverage).toEqual({
      expectedSessionPages: 1,
      fetchedSessionPages: 1,
      expectedSessions: 3,
      extractedSessions: 3,
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
    expect(fetchedUrls).toEqual([ROOT_URL, AGENDA_URL]);
  });

  it("preserves a no-comma official name while splitting its company", async () => {
    const commissionerAgenda = agendaHtml
      .replace("speakers/sam-lee", "speakers/commissioner-kerrick-johnson")
      .replace(
        "Sam Lee, Director, AI Infrastructure - Example Labs",
        "Commissioner Kerrick Johnson - Vermont Public Service",
      );

    const { graph } = await fetchFixtureGraph(commissionerAgenda);
    expect(graph.speakers.find((speaker) => speaker.name === "Commissioner Kerrick Johnson")).toMatchObject({
      title: "",
      company: "Vermont Public Service",
    });
  });

  it("keeps an observed Ph.D. credential in the speaker name", async () => {
    const credentialAgenda = agendaHtml
      .replace("speakers/sam-lee", "speakers/saeed-kamalinia-phd")
      .replace(
        "Sam Lee, Director, AI Infrastructure - Example Labs",
        "Saeed Kamalinia, Ph.D., Manager, Energy Strategy, AWS Data Center Global Services - Amazon Web Services",
      );

    const { graph } = await fetchFixtureGraph(credentialAgenda);
    expect(graph.speakers.find((speaker) => speaker.name === "Saeed Kamalinia, Ph.D.")).toMatchObject({
      title: "Manager, Energy Strategy, AWS Data Center Global Services",
      company: "Amazon Web Services",
    });
  });

  it("normalizes an observed percent-encoded Unicode speaker path", async () => {
    const unicodeAgenda = agendaHtml
      .replace("speakers/sam-lee", "speakers/lea-m%C3%A1rquez-peterson")
      .replace(
        "Sam Lee, Director, AI Infrastructure - Example Labs",
        "Lea Márquez Peterson, Commissioner - Arizona Corporation",
      );

    const { graph } = await fetchFixtureGraph(unicodeAgenda);
    expect(graph.speakers.find((speaker) => speaker.name === "Lea Márquez Peterson")).toMatchObject({
      id: "dtech-data-centers-and-ai-2026-2026-05-12:speaker:lea-marquez-peterson",
      title: "Commissioner",
      company: "Arizona Corporation",
    });
  });

  it("normalizes an observed nested session detail path", async () => {
    const nestedPathAgenda = agendaHtml.replace(
      'href="event-schedule-2026/grid-readiness">Opening Keynote',
      'href="event-schedule-2026/co-designing/optimizing-data-centers">Opening Keynote',
    );

    const { graph } = await fetchFixtureGraph(nestedPathAgenda);
    expect(graph.sessions.find((session) => session.title === "Opening Keynote")?.sourceId).toBe(
      "co-designing-optimizing-data-centers:2026-05-12:0800",
    );
  });

  it("fails closed when the declared and extracted session counts differ", async () => {
    const mismatchedAgenda = agendaHtml.replace('data-totalcount="3"', 'data-totalcount="4"');
    await expect(fetchFixtureGraph(mismatchedAgenda)).rejects.toThrow(
      /declared session count 4 does not match extracted session count 3/,
    );
  });

  it("fails closed while the agenda is unpublished", async () => {
    const emptyAgenda = agendaHtml.replace('data-totalcount="3"', 'data-totalcount="0"');
    await expect(fetchFixtureGraph(emptyAgenda)).rejects.toThrow(
      /declared session count must be greater than zero/,
    );
  });
});
