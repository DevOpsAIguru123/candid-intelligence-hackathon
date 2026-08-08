import { describe, expect, it } from "vitest";

import { fetchPowergenConference } from "@/lib/adapters/powergen";

const ROOT_URL = "https://powergen.example.test/";
const AGENDA_URL = `${ROOT_URL}event-info/event-schedule`;
const SPEAKERS_URL = `${ROOT_URL}speakers`;
const AGENDA_SITEMAP_URL = `${ROOT_URL}agenda-sitemap.xml`;
const SPEAKER_SITEMAP_URL = `${ROOT_URL}speaker-sitemap.xml`;
const SESSION_URL = `${ROOT_URL}2027-event-agenda/opening-keynote`;

const speakerListHtml = `
  <div data-totalcount="2"></div>
  <script type="application/ld+json">
    {
      "@graph": [
        {
          "@type": "Person",
          "name": "Alice Rivera",
          "jobTitle": "Chief Executive Officer",
          "worksFor": { "name": "Meridian Energy" },
          "email": "mailto:ALICE@MERIDIAN.EXAMPLE",
          "telephone": ["tel:+1-555-0100"],
          "sameAs": ["https://example.com/alice", "https://www.linkedin.com/in/alice-rivera"],
          "mainEntityOfPage": { "@id": "/speakers/alice-rivera" }
        },
        {
          "@type": ["Person"],
          "name": "Bob Lee",
          "jobTitle": "Analyst",
          "worksFor": ["Grid Labs"],
          "url": "/speakers/bob-lee"
        }
      ]
    }
  </script>
`;

const responses: Record<string, string> = {
  [ROOT_URL]: "<body>POWERGEN International January 18-21, 2027</body>",
  [AGENDA_URL]: `<div data-totalcount="1"></div><button onclick="openRemoteModal('/2027-event-agenda/opening-keynote')">Open</button>`,
  [SPEAKERS_URL]: speakerListHtml,
  [AGENDA_SITEMAP_URL]: `<urlset><url><loc>${SESSION_URL}</loc></url></urlset>`,
  [SPEAKER_SITEMAP_URL]: `<urlset><url><loc>${ROOT_URL}speakers/alice-rivera</loc></url><url><loc>${ROOT_URL}speakers/bob-lee</loc></url></urlset>`,
  [SESSION_URL]: `
    <meta property="og:title" content="Opening Keynote">
    <div data-time-utc="2027-01-18T15:00:00.000Z"></div>
    <div data-time-utc="2027-01-18T16:00:00.000Z"></div>
    <div class="location">Main Stage</div>
    <div class="stream">Keynote</div>
    <div class="description">Power market outlook.</div>
    <a href="/speakers/alice-rivera">Alice Rivera</a>
    <a href="/speakers/bob-lee">Bob Lee</a>
  `,
};

describe("fetchPowergenConference", () => {
  it("extracts direct structured contacts and preserves inventory output", async () => {
    const graph = await fetchPowergenConference({
      rootUrl: ROOT_URL,
      agendaUrl: AGENDA_URL,
      speakersUrl: SPEAKERS_URL,
      agendaSitemapUrl: AGENDA_SITEMAP_URL,
      speakerSitemapUrl: SPEAKER_SITEMAP_URL,
      now: () => new Date("2026-08-08T12:00:00.000Z"),
      fetchText: async (url) => {
        const response = responses[url];
        if (!response) throw new Error(`Unexpected URL ${url}`);
        return response;
      },
    });

    expect(graph.sessions).toHaveLength(1);
    expect(graph.sessionSpeakers).toHaveLength(2);
    expect(graph.speakers).toHaveLength(2);
    expect(graph.speakers.find((speaker) => speaker.name === "Alice Rivera")).toMatchObject({
      id: "powergen-international-2027:speaker:alice-rivera",
      title: "Chief Executive Officer",
      company: "Meridian Energy",
      email: "alice@meridian.example",
      phone: "+1-555-0100",
      linkedinUrl: "https://www.linkedin.com/in/alice-rivera",
      profileUrl: "https://powergen.example.test/speakers/alice-rivera",
      sessionTitle: "Opening Keynote",
    });
    expect(graph.speakers.find((speaker) => speaker.name === "Bob Lee")).toMatchObject({
      title: "Analyst",
      company: "Grid Labs",
      email: "",
      phone: "",
      linkedinUrl: "",
      profileUrl: "https://powergen.example.test/speakers/bob-lee",
      sessionTitle: "Opening Keynote",
    });
    expect(graph.coverage).toMatchObject({
      expectedSessions: 1,
      extractedSessions: 1,
      expectedIndexedSpeakers: 2,
      extractedIndexedSpeakers: 2,
      expectedTotalSpeakers: 2,
      totalSpeakers: 2,
    });
  });
});
