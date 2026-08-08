import type { Conference, Speaker, SourceMode } from "@/lib/domain";

/**
 * A recurring event we watch before anyone has read its agenda. Most industry
 * conferences repeat in the same annual window, so the next edition can be
 * projected from that window. Nothing supplies these yet — they belong in a
 * table so the watchlist is data, not code.
 */
export interface ConferenceSeries {
  id: string;
  name: string;
  organizer: string;
  /** Public landing page. The exact agenda path is resolved at check time. */
  agendaUrl: string;
  location: string;
  /** Historical start month, 1-12. */
  typicalStartMonth: number;
  typicalStartDay: number;
  typicalDurationDays: number;
  lens: "core" | "adjacent";
  note: string;
  /** Case-insensitive tokens used to attach an ingested conference to this series. */
  match: string[];
}

/**
 * The calendar merges two things the interface has to show side by side:
 * seeded recurring series whose next edition is only projected, and
 * conferences whose agenda has actually been ingested. Everything here is a
 * pure function of that input plus `now`, so the board renders identically on
 * the server and after a client poll.
 */

export type CalendarStatus = "agenda_live" | "tracking" | "past";

export interface CalendarTopSpeaker {
  id: string;
  name: string;
  title: string;
  company: string;
  score: number;
}

export interface CalendarEntry {
  key: string;
  seriesId: string | null;
  name: string;
  organizer: string;
  location: string;
  lens: "core" | "adjacent";
  note: string;
  agendaUrl: string;
  startsAt: string;
  endsAt: string;
  dateConfidence: "confirmed" | "projected";
  daysUntil: number;
  status: CalendarStatus;
  conferenceId: string | null;
  sourceMode: SourceMode | null;
  speakerCount: number;
  qualifiedCount: number;
  topSpeaker: CalendarTopSpeaker | null;
  lastCheckedAt: string | null;
  nextCheckAt: string;
}

export interface ProjectedEdition {
  editionYear: number;
  startsAt: string;
  endsAt: string;
}

const DAY_MS = 86_400_000;

/**
 * Projected editions land at 14:00 UTC — mid-morning in Houston — so formatting
 * the ISO string in any US timezone never slips to the previous calendar day.
 */
const PROJECTION_HOUR_UTC = 14;

function utcMidnight(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function edition(series: ConferenceSeries, year: number): ProjectedEdition {
  const start = Date.UTC(
    year,
    series.typicalStartMonth - 1,
    series.typicalStartDay,
    PROJECTION_HOUR_UTC,
  );
  const end = start + Math.max(series.typicalDurationDays - 1, 0) * DAY_MS;
  return {
    editionYear: year,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
  };
}

/** The next edition of a recurring series that has not already finished. */
export function projectNextEdition(series: ConferenceSeries, now: Date): ProjectedEdition {
  const thisYear = edition(series, now.getUTCFullYear());
  if (Date.parse(thisYear.endsAt) >= now.getTime()) return thisYear;
  return edition(series, now.getUTCFullYear() + 1);
}

/** Whole calendar days from `now` to the event start; negative once it has begun. */
export function daysUntilStart(startsAt: string, now: Date): number {
  return Math.round((utcMidnight(new Date(startsAt)) - utcMidnight(now)) / DAY_MS);
}

/**
 * How often the watcher should re-check a source. An event two weeks out is
 * publishing and revising its agenda constantly; one three seasons out is not.
 */
export function refreshIntervalMinutes(daysUntil: number): number {
  if (daysUntil < 0) return 1440;
  if (daysUntil <= 14) return 15;
  if (daysUntil <= 60) return 60;
  if (daysUntil <= 180) return 360;
  return 1440;
}

function sameSeries(series: ConferenceSeries, conference: Conference): boolean {
  const name = conference.name.toLowerCase();
  if (series.match.some((token) => name.includes(token.toLowerCase()))) return true;

  try {
    const agenda = new URL(series.agendaUrl);
    const source = new URL(conference.sourceUrl);
    return source.hostname === agenda.hostname && source.pathname.startsWith(agenda.pathname);
  } catch {
    return false;
  }
}

function speakerSummary(speakers: Speaker[]) {
  const ranked = [...speakers].sort(
    (left, right) => right.score - left.score || left.name.localeCompare(right.name),
  );
  const top = ranked[0];
  return {
    speakerCount: ranked.length,
    qualifiedCount: ranked.filter((speaker) => speaker.score >= 60).length,
    topSpeaker: top
      ? {
          id: top.id,
          name: top.name,
          title: top.title,
          company: top.company,
          score: top.score,
        }
      : null,
  };
}

function scheduleNextCheck(lastCheckedAt: string | null, daysUntil: number, now: Date): string {
  if (!lastCheckedAt) return now.toISOString();
  const due = Date.parse(lastCheckedAt) + refreshIntervalMinutes(daysUntil) * 60_000;
  return new Date(due).toISOString();
}

function fromConference(
  conference: Conference,
  speakers: Speaker[],
  series: ConferenceSeries | null,
  now: Date,
): CalendarEntry {
  const daysUntil = daysUntilStart(conference.startsAt, now);
  const finished = Date.parse(conference.endsAt || conference.startsAt) < now.getTime();
  return {
    key: series?.id ?? `conference:${conference.id}`,
    seriesId: series?.id ?? null,
    name: series?.name ?? conference.name,
    organizer: series?.organizer ?? "Added by you",
    location: conference.location || series?.location || "Location to be announced",
    lens: series?.lens ?? "core",
    note: series?.note ?? "Added from an event page you analyzed.",
    agendaUrl: conference.sourceUrl,
    startsAt: conference.startsAt,
    endsAt: conference.endsAt || conference.startsAt,
    dateConfidence: "confirmed",
    daysUntil,
    status: finished ? "past" : "agenda_live",
    conferenceId: conference.id,
    sourceMode: conference.sourceMode,
    lastCheckedAt: conference.lastIngestedAt,
    nextCheckAt: scheduleNextCheck(conference.lastIngestedAt, daysUntil, now),
    ...speakerSummary(speakers),
  };
}

function fromSeries(series: ConferenceSeries, now: Date): CalendarEntry {
  const projected = projectNextEdition(series, now);
  const daysUntil = daysUntilStart(projected.startsAt, now);
  return {
    key: series.id,
    seriesId: series.id,
    name: series.name,
    organizer: series.organizer,
    location: series.location,
    lens: series.lens,
    note: series.note,
    agendaUrl: series.agendaUrl,
    startsAt: projected.startsAt,
    endsAt: projected.endsAt,
    dateConfidence: "projected",
    daysUntil,
    status: "tracking",
    conferenceId: null,
    sourceMode: null,
    speakerCount: 0,
    qualifiedCount: 0,
    topSpeaker: null,
    lastCheckedAt: null,
    nextCheckAt: scheduleNextCheck(null, daysUntil, now),
  };
}

export interface CalendarInput {
  series: ConferenceSeries[];
  conferences: Conference[];
  speakers: Speaker[];
  now: Date;
}

/**
 * One ranked list of every event the engine is watching: soonest first, with
 * finished events kept at the end rather than dropped, so history stays visible.
 */
export function buildCalendar(input: CalendarInput): CalendarEntry[] {
  const { series, conferences, speakers, now } = input;
  const speakersByConference = new Map<string, Speaker[]>();
  for (const speaker of speakers) {
    const bucket = speakersByConference.get(speaker.conferenceId) ?? [];
    bucket.push(speaker);
    speakersByConference.set(speaker.conferenceId, bucket);
  }

  const claimed = new Set<string>();
  const entries: CalendarEntry[] = series.map((candidate) => {
    const matches = conferences
      .filter((conference) => sameSeries(candidate, conference))
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    const upcoming = matches.find((conference) => daysUntilStart(conference.startsAt, now) >= 0);
    const conference = upcoming ?? matches.at(-1);
    if (!conference) return fromSeries(candidate, now);

    claimed.add(conference.id);
    return fromConference(
      conference,
      speakersByConference.get(conference.id) ?? [],
      candidate,
      now,
    );
  });

  for (const conference of conferences) {
    if (claimed.has(conference.id)) continue;
    entries.push(
      fromConference(conference, speakersByConference.get(conference.id) ?? [], null, now),
    );
  }

  const upcoming = entries
    .filter((entry) => entry.status !== "past")
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  const past = entries
    .filter((entry) => entry.status === "past")
    .sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt));
  return [...upcoming, ...past];
}

/* Month grid — the popup view of the same entries the board ranks. */

export interface MonthDay {
  /** UTC date key, e.g. "2026-10-12". */
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

export interface MonthGrid {
  monthKey: string;
  label: string;
  weeks: MonthDay[][];
  /** Distinct events touching this month, not day cells filled. */
  eventCount: number;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** The calendar month an instant falls in, read in UTC like every other date here. */
export function monthKeyOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

/**
 * A conventional Sunday-to-Saturday month grid. Events occupy every day they
 * span, so a four-day conference reads as a block rather than a single dot.
 */
export function buildMonthGrid(
  entries: CalendarEntry[],
  monthKey: string,
  now: Date,
): MonthGrid {
  const [year, month] = monthKey.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const firstCell = new Date(firstOfMonth);
  firstCell.setUTCDate(1 - firstOfMonth.getUTCDay());
  const lastOfMonth = new Date(Date.UTC(year, month, 0));
  const todayKey = dateKey(now);

  const byDate = new Map<string, CalendarEntry[]>();
  const touching = new Set<string>();
  for (const entry of entries) {
    const cursor = new Date(Date.parse(entry.startsAt));
    const end = new Date(Date.parse(entry.endsAt || entry.startsAt));
    while (cursor.getTime() <= end.getTime()) {
      const key = dateKey(cursor);
      if (key.startsWith(monthKey)) {
        byDate.set(key, [...(byDate.get(key) ?? []), entry]);
        touching.add(entry.key);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const weeks: MonthDay[][] = [];
  const cursor = new Date(firstCell);
  while (cursor.getTime() <= lastOfMonth.getTime() || cursor.getUTCDay() !== 0) {
    const week: MonthDay[] = [];
    for (let index = 0; index < 7; index += 1) {
      const key = dateKey(cursor);
      week.push({
        date: key,
        dayOfMonth: cursor.getUTCDate(),
        inMonth: key.startsWith(monthKey),
        isToday: key === todayKey,
        entries: byDate.get(key) ?? [],
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  return {
    monthKey,
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(firstOfMonth),
    weeks,
    eventCount: touching.size,
  };
}

export interface CalendarPayload {
  generatedAt: string;
  summary: CalendarSummary;
  entries: CalendarEntry[];
}

export interface CalendarSummary {
  tracked: number;
  live: number;
  qualified: number;
  nextEvent: CalendarEntry | null;
  nextCheckAt: string | null;
}

export function summarizeCalendar(entries: CalendarEntry[]): CalendarSummary {
  const upcoming = entries.filter((entry) => entry.status !== "past");
  const dueTimes = upcoming.map((entry) => Date.parse(entry.nextCheckAt)).filter(Number.isFinite);
  return {
    tracked: entries.length,
    live: entries.filter((entry) => entry.status === "agenda_live").length,
    qualified: entries.reduce((total, entry) => total + entry.qualifiedCount, 0),
    nextEvent: upcoming[0] ?? null,
    nextCheckAt: dueTimes.length ? new Date(Math.min(...dueTimes)).toISOString() : null,
  };
}
