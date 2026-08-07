import { describe, expect, it } from "vitest";

import type { Conference, Speaker } from "@/lib/domain";
import { buildSequence, buildWhyNow } from "@/lib/sequence";

const speaker: Speaker = {
  id: "speaker-jane",
  conferenceId: "conference-grid",
  name: "Jane Smith",
  title: "VP Engineering",
  company: "ABC Energy",
  sessionTitle: "Behind-the-Meter Power for AI",
  score: 90,
  scoreReasons: [
    {
      group: "seniority",
      points: 25,
      reason: "Senior decision-maker",
      evidence: "VP Engineering",
    },
  ],
  dedupeKey: "jane-smith::abc-energy",
};

function conference(startsAt: string): Conference {
  return {
    id: "conference-grid",
    name: "Grid & AI Power Summit",
    sourceUrl: "https://events.example/agenda",
    location: "Houston, TX",
    startsAt,
    endsAt: startsAt,
    sourceMode: "live",
    ingestionStatus: "complete",
    lastIngestedAt: "2026-08-07T12:00:00.000Z",
  };
}

describe("conference-relative outreach", () => {
  it("anchors five drafts to the conference start date across a year boundary", () => {
    const steps = buildSequence(speaker, conference("2027-01-05T09:00:00-06:00"));

    expect(steps.map((step) => step.offsetDays)).toEqual([-14, -7, -2, 0, 2]);
    expect(steps[0].scheduledAt.startsWith("2026-12-22")).toBe(true);
    expect(steps.filter((step) => step.channel === "email").every((step) => /opt out/i.test(step.message))).toBe(true);
    expect(steps).toHaveLength(5);
  });

  it("grounds Why Now in known conference timing and speaker evidence", () => {
    const whyNow = buildWhyNow(
      speaker,
      conference("2026-09-15T09:00:00-05:00"),
      new Date("2026-08-27T12:00:00-05:00"),
    );

    expect(whyNow.daysUntil).toBe(19);
    expect(whyNow.summary).toContain("Behind-the-Meter Power for AI");
    expect(whyNow.summary).toContain("19 days");
    expect(whyNow.action).toContain("15-minute meeting");
  });
});
