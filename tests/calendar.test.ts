import { describe, expect, it } from "vitest";

import {
  buildCalendar,
  buildMonthGrid,
  projectNextEdition,
  shiftMonthKey,
  type ConferenceSeries,
} from "@/lib/calendar";
import type { Conference, Speaker } from "@/lib/domain";

/**
 * Covers the date and ranking rules that would put someone in the wrong city on
 * the wrong week. Pure lookup helpers (interval tiers, month-key parsing) are
 * exercised through these paths rather than asserted on their own.
 */

const series: ConferenceSeries = {
  id: "gulf-power-summit",
  name: "Gulf Power Summit",
  organizer: "Test Organizer",
  agendaUrl: "https://events.example/gulf",
  location: "Houston, Texas",
  typicalStartMonth: 3,
  typicalStartDay: 9,
  typicalDurationDays: 4,
  lens: "core",
  note: "Seeded for tests.",
  match: ["gulf power summit"],
};

function conference(overrides: Partial<Conference> = {}): Conference {
  return {
    id: "gulf-power-summit-2027",
    name: "Gulf Power Summit 2027",
    sourceUrl: "https://events.example/gulf/agenda",
    location: "Houston, Texas",
    startsAt: "2027-03-15T09:00:00-05:00",
    endsAt: "2027-03-17T17:00:00-05:00",
    sourceMode: "live",
    ingestionStatus: "complete",
    lastIngestedAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

function speaker(conferenceId: string, score: number, name: string): Speaker {
  return {
    id: `${conferenceId}:${name.toLowerCase().replace(/\s+/g, "-")}`,
    conferenceId,
    name,
    title: "VP Engineering",
    company: "Example Power",
    sessionTitle: "Behind-the-Meter Power",
    score,
    scoreReasons: [],
    dedupeKey: name.toLowerCase(),
  };
}

const now = new Date("2026-08-08T12:00:00.000Z");

describe("projectNextEdition", () => {
  it("rolls a finished annual window forward to next year", () => {
    expect(projectNextEdition(series, new Date("2026-01-05T00:00:00.000Z")).editionYear).toBe(2026);

    const next = projectNextEdition(series, now);
    expect(next.editionYear).toBe(2027);
    expect(next.startsAt.startsWith("2027-03-09")).toBe(true);
    expect(next.endsAt.startsWith("2027-03-12")).toBe(true);
  });
});

describe("buildCalendar", () => {
  it("tracks a seeded event with a projected date before any agenda is read", () => {
    const [entry] = buildCalendar({ series: [series], conferences: [], speakers: [], now });

    expect(entry).toMatchObject({
      status: "tracking",
      dateConfidence: "projected",
      conferenceId: null,
      speakerCount: 0,
    });
    expect(entry.startsAt.startsWith("2027-03-09")).toBe(true);
  });

  it("promotes an event to a confirmed date once its speakers are read", () => {
    const ingested = conference();
    const [entry] = buildCalendar({
      series: [series],
      conferences: [ingested],
      speakers: [
        speaker(ingested.id, 100, "Maya Torres"),
        speaker(ingested.id, 85, "Noah Bennett"),
        speaker(ingested.id, 20, "Marcus Chen"),
      ],
      now,
    });

    expect(entry).toMatchObject({
      status: "agenda_live",
      dateConfidence: "confirmed",
      conferenceId: ingested.id,
      speakerCount: 3,
      qualifiedCount: 2,
    });
    expect(entry.topSpeaker).toMatchObject({ name: "Maya Torres", score: 100 });
  });

  it("keeps an analyzed event that no seeded series claims", () => {
    const demo = conference({
      id: "gulf-coast-power-ai-forum-2026",
      name: "Gulf Coast Power & AI Forum 2026",
      sourceUrl: "demo://gulf-coast-power-ai-forum-2026",
      startsAt: "2026-10-12T09:00:00-05:00",
      sourceMode: "demo",
    });

    const entries = buildCalendar({ series: [], conferences: [demo], speakers: [], now });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ seriesId: null, conferenceId: demo.id, sourceMode: "demo" });
  });

  it("ranks the soonest event first and pushes finished ones to the end", () => {
    const past = conference({
      id: "past-summit-2026",
      name: "Past Summit 2026",
      sourceUrl: "https://events.example/past",
      startsAt: "2026-05-01T09:00:00-05:00",
      endsAt: "2026-05-02T17:00:00-05:00",
    });
    const soon = conference({
      id: "soon-summit-2026",
      name: "Soon Summit 2026",
      sourceUrl: "https://events.example/soon",
      startsAt: "2026-08-20T09:00:00-05:00",
      endsAt: "2026-08-21T17:00:00-05:00",
    });

    const entries = buildCalendar({ series: [series], conferences: [past, soon], speakers: [], now });

    expect(entries.map((entry) => entry.name)).toEqual([
      "Soon Summit 2026",
      "Gulf Power Summit",
      "Past Summit 2026",
    ]);
    expect(entries.at(-1)?.status).toBe("past");
  });

  it("schedules the next check sooner for events that are close", () => {
    const soon = conference({
      id: "soon-summit-2026",
      name: "Soon Summit 2026",
      sourceUrl: "https://events.example/soon",
      startsAt: "2026-08-15T09:00:00-05:00",
      lastIngestedAt: "2026-08-08T11:00:00.000Z",
    });

    const [entry] = buildCalendar({ series: [], conferences: [soon], speakers: [], now });
    expect(entry.nextCheckAt).toBe("2026-08-08T11:15:00.000Z");
  });
});

describe("buildMonthGrid", () => {
  const entries = buildCalendar({
    series: [series],
    conferences: [
      conference({
        id: "soon-summit-2026",
        name: "Soon Summit 2026",
        sourceUrl: "https://events.example/soon",
        startsAt: "2026-08-10T14:00:00.000Z",
        endsAt: "2026-08-13T14:00:00.000Z",
      }),
    ],
    speakers: [],
    now,
  });

  it("lays out whole weeks and marks today", () => {
    const grid = buildMonthGrid(entries, "2026-08", now);

    expect(grid.label).toBe("August 2026");
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks.flat().filter((day) => day.inMonth)).toHaveLength(31);
    expect(grid.weeks.flat().filter((day) => day.isToday).map((day) => day.date)).toEqual([
      "2026-08-08",
    ]);
  });

  it("puts a multi-day event on every day it runs, across a year boundary", () => {
    const august = buildMonthGrid(entries, "2026-08", now);
    expect(
      august.weeks.flat().filter((day) => day.entries.length > 0).map((day) => day.date),
    ).toEqual(["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]);

    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    const march = buildMonthGrid(entries, "2027-03", now);
    expect(march.eventCount).toBe(1);
  });
});
