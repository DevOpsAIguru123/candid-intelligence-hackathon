import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractConference } from "@/lib/parser";

const fixture = readFileSync("tests/fixtures/conference.html", "utf8");

describe("extractConference", () => {
  it("extracts event metadata and associates speakers with sessions", () => {
    const result = extractConference(fixture, "https://events.example/agenda");

    expect(result.conference).toMatchObject({
      name: "Grid & AI Power Summit 2026",
      startsAt: "2026-09-15T09:00:00-05:00",
      location: "George R. Brown Convention Center, Houston",
    });
    expect(result.speakers[0]).toMatchObject({
      name: "Jane Smith",
      company: "ABC Energy, LLC",
      sessionTitle: "Behind-the-Meter Power for AI",
    });
    expect(result.speakers.some((speaker) => speaker.name === "Lunch Break")).toBe(false);
  });

  it("extracts speakers from JSON-LD Person objects and performers", () => {
    const jsonLdHtml = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Event",
            "name": "Global Energy AI Expo 2026",
            "startDate": "2026-10-20T09:00:00Z",
            "performer": [
              {
                "@type": "Person",
                "name": "Sarah Connor",
                "jobTitle": "Chief Technology Officer",
                "worksFor": { "@type": "Organization", "name": "Cyberdyne Energy" }
              }
            ]
          }
          </script>
        </head>
        <body></body>
      </html>
    `;
    const result = extractConference(jsonLdHtml, "https://events.example/jsonld");
    expect(result.conference.name).toBe("Global Energy AI Expo 2026");
    expect(result.speakers).toHaveLength(1);
    expect(result.speakers[0]).toMatchObject({
      name: "Sarah Connor",
      title: "Chief Technology Officer",
      company: "Cyberdyne Energy",
    });
  });

  it("extracts speakers from custom classes like Data Center World markup", () => {
    const customHtml = `
      <html>
        <body>
          <div class="sb5-speakers-page-speaker">
            <a href="/speaker/alex-mercer">
              <span class="speaker_name">Alex Mercer</span>
              <span class="speaker_title">VP Data Center Solutions</span>
              <span class="speaker_company">HyperScale Power</span>
            </a>
          </div>
        </body>
      </html>
    `;
    const result = extractConference(customHtml, "https://events.example/datacenter");
    expect(result.speakers).toHaveLength(1);
    expect(result.speakers[0]).toMatchObject({
      name: "Alex Mercer",
      title: "VP Data Center Solutions",
      company: "HyperScale Power",
    });
  });

  it("extracts speakers from simple anchor cards", () => {
    const simpleAnchorHtml = `
      <html>
        <head><title>Data Center World 2026</title></head>
        <body>
          <div class="sb5-speakers-page-speaker">
            <a href="https://schedule.datacenterworld.com/speaker/accomando-jane/82446" rel="external">Jane Accomando</a>
          </div>
        </body>
      </html>
    `;
    const result = extractConference(simpleAnchorHtml, "https://schedule.datacenterworld.com/speakers");
    expect(result.speakers).toHaveLength(1);
    expect(result.speakers[0].name).toBe("Jane Accomando");
    expect(result.conference.name).toBe("Data Center World 2026");
  });
});



