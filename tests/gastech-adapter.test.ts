import { describe, expect, it } from "vitest";

import { fetchGastechConference } from "@/lib/adapters/gastech";

const ROOT_URL = "https://gastech.example.test/";
const AGENDA_URL = "https://gastech.example.test/agenda?type=Strategic-Conference";

const rootHtml = "<html><body>Gastech runs 14 - 17 September 2026</body></html>";
const agendaHtml = `
  <article data-session-id="opening" data-date="2026-09-14" data-start-time="09:00" data-end-time="10:00" data-session-type="Keynote">
    <a href="/sessions/opening">Opening Keynote</a>
    <p class="description">Regional energy outlook.</p>
    <span class="location">Main Stage</span>
    <div class="session-speaker" data-speaker-id="alice-rivera" data-speaker-name="Alice Rivera" data-job-title="Chief Executive Officer" data-company="Meridian Energy" data-email="ALICE@MERIDIAN.EXAMPLE" data-phone="+66 2 555 0100" data-linkedin-url="https://www.linkedin.com/in/alice-rivera" data-profile-url="/speakers/alice-rivera" data-speaker-role="Keynote Speaker"></div>
    <div class="session-speaker" data-speaker-id="bob-lee" data-speaker-name="Bob Lee" data-job-title="Analyst" data-company="Grid Labs"></div>
  </article>
  <article data-session-id="markets" data-date="2026-09-14" data-start-time="11:00" data-end-time="12:00">
    <a href="/sessions/markets">Market Outlook</a>
    <div class="session-speaker" data-speaker-id="alice-rivera" data-speaker-name="Alice Rivera" data-job-title="Chief Executive Officer" data-company="Meridian Energy"></div>
  </article>
`;

describe("fetchGastechConference", () => {
  it("extracts direct contacts without perturbing session output", async () => {
    const graph = await fetchGastechConference({
      rootUrl: ROOT_URL,
      agendaUrls: [AGENDA_URL],
      now: () => new Date("2026-08-08T12:00:00.000Z"),
      fetchText: async (url) => {
        if (url === ROOT_URL) return rootHtml;
        if (url === AGENDA_URL) return agendaHtml;
        throw new Error(`Unexpected URL ${url}`);
      },
    });

    expect(graph.sessions.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: "gastech-2026:session:opening", title: "Opening Keynote" },
      { id: "gastech-2026:session:markets", title: "Market Outlook" },
    ]);
    expect(graph.researchTasks).toHaveLength(2);

    const alice = graph.speakers.find((speaker) => speaker.name === "Alice Rivera");
    expect(alice).toMatchObject({
      id: "gastech-2026:speaker:alice-rivera",
      title: "Chief Executive Officer",
      company: "Meridian Energy",
      email: "alice@meridian.example",
      phone: "+66 2 555 0100",
      linkedinUrl: "https://www.linkedin.com/in/alice-rivera",
      profileUrl: "https://gastech.example.test/speakers/alice-rivera",
      sessionTitle: "Opening Keynote",
    });
    expect(graph.speakers.find((speaker) => speaker.name === "Bob Lee")).toMatchObject({
      company: "Grid Labs",
      email: "",
      phone: "",
      linkedinUrl: "",
      profileUrl: "",
    });
    expect(graph.sessionSpeakers).toHaveLength(3);
    expect(graph.coverage).toMatchObject({
      expectedSessions: 2,
      extractedSessions: 2,
      structuredAgendaSpeakers: 2,
      expectedTotalSpeakers: 2,
      totalSpeakers: 2,
    });
  });
});
