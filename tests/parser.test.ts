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
});
