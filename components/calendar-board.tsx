"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MonthCalendarDialog } from "@/components/month-calendar-dialog";
import type { CalendarEntry, CalendarPayload } from "@/lib/calendar";
import { formatSourceMode } from "@/lib/source-mode";

const POLL_MS = 30_000;

const STATUS_LABEL: Record<CalendarEntry["status"], string> = {
  agenda_live: "SPEAKERS PUBLISHED",
  tracking: "WATCHING",
  past: "FINISHED",
};

function formatWindow(entry: CalendarEntry): string {
  const start = new Date(entry.startsAt);
  const end = new Date(entry.endsAt);
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });
  const head = `${month.format(start)} ${day.format(start)}`;
  const tail =
    month.format(start) === month.format(end) ? day.format(end) : `${month.format(end)} ${day.format(end)}`;
  return start.getTime() === end.getTime()
    ? `${head}, ${year.format(start)}`
    : `${head}–${tail}, ${year.format(end)}`;
}

function countdown(entry: CalendarEntry): { value: string; caption: string } {
  if (entry.status === "past") return { value: `${Math.abs(entry.daysUntil)}`, caption: "days ago" };
  if (entry.daysUntil === 0) return { value: "TODAY", caption: "happening now" };
  if (entry.daysUntil === 1) return { value: "1", caption: "day away" };
  return { value: `${entry.daysUntil}`, caption: "days away" };
}

function relativeTime(from: string | null, nowMs: number): string {
  if (!from) return "never";
  const deltaMs = nowMs - Date.parse(from);
  const minutes = Math.round(Math.abs(deltaMs) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function dueIn(nextCheckAt: string, nowMs: number): string {
  const deltaMs = Date.parse(nextCheckAt) - nowMs;
  if (deltaMs <= 0) return "due now";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return `in ${Math.max(Math.floor(deltaMs / 1000), 1)}s`;
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `in ${hours}h` : `in ${Math.floor(hours / 24)}d`;
}

/**
 * Between checks the row shows how much of its own interval has elapsed, so the
 * board reads as a system that is working rather than a static table.
 */
function watchProgress(entry: CalendarEntry, nowMs: number): number {
  // A source that has never been checked has no interval to fill; a full bar
  // there would read as work already done.
  if (!entry.lastCheckedAt) return 0;
  const start = Date.parse(entry.lastCheckedAt);
  const end = Date.parse(entry.nextCheckAt);
  if (!(end > start)) return 100;
  return Math.min(100, Math.max(0, ((nowMs - start) / (end - start)) * 100));
}

function isExternal(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function CalendarBoard({ initial }: { initial: CalendarPayload }) {
  const [payload, setPayload] = useState(initial);
  // Seeded from the server payload so the first client render matches the
  // server HTML exactly; the ticker takes over after mount.
  const [nowMs, setNowMs] = useState(() => Date.parse(initial.generatedAt));
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as CalendarPayload;
      setPayload(next);
      setNowMs(Date.parse(next.generatedAt));
    } catch {
      // A failed poll keeps the last good board on screen.
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => setNowMs(Date.now()), 1_000);
    const poller = setInterval(() => void sync(), POLL_MS);
    return () => {
      clearInterval(ticker);
      clearInterval(poller);
    };
  }, [sync]);

  const { summary, entries } = payload;

  return (
    <div className="calendar-board">
      <div className="calendar-bar">
        <div className="calendar-bar-live">
          <span className="live-dot" aria-hidden="true" />
          <span>
            <strong>Watching {summary.tracked} events</strong>
            <small data-testid="calendar-freshness">
              Updated {relativeTime(payload.generatedAt, nowMs)}
              {summary.nextCheckAt ? ` · next check ${dueIn(summary.nextCheckAt, nowMs)}` : ""}
            </small>
          </span>
        </div>
        <div className="calendar-bar-actions">
          <MonthCalendarDialog entries={entries} nowIso={payload.generatedAt} />
          <button className="text-button" disabled={syncing} onClick={() => void sync()} type="button">
            {syncing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <ol className="calendar-list" aria-label="Events we are watching">
        {entries.map((entry) => {
          const clock = countdown(entry);
          const progress = watchProgress(entry, nowMs);
          return (
            <li className={`calendar-entry status-${entry.status}`} data-testid="calendar-entry" key={entry.key}>
              <div className="calendar-clock">
                <strong data-testid="calendar-countdown">{clock.value}</strong>
                <small>{clock.caption}</small>
              </div>

              <div className="calendar-main">
                <div className="calendar-pills">
                  <span className={`calendar-status calendar-status-${entry.status}`}>
                    {STATUS_LABEL[entry.status]}
                  </span>
                  <span className={`calendar-lens lens-${entry.lens}`}>
                    {entry.lens === "core" ? "BEST FIT" : "POSSIBLE FIT"}
                  </span>
                  {entry.sourceMode ? (
                    <span className={`mode-badge mode-${entry.sourceMode}`}>
                      {formatSourceMode(entry.sourceMode)}
                    </span>
                  ) : null}
                </div>

                <h3>
                  {entry.conferenceId ? (
                    <Link className="calendar-entry-link" href={`/conferences/${entry.conferenceId}`}>
                      {entry.name}
                    </Link>
                  ) : (
                    entry.name
                  )}
                </h3>
                <p className="calendar-meta">
                  {formatWindow(entry)}
                  <span className={`date-confidence date-${entry.dateConfidence}`}>
                    {entry.dateConfidence === "confirmed" ? "dates confirmed" : "dates expected"}
                  </span>
                  · {entry.location} · {entry.organizer}
                </p>

                {/* Why an event is watched lives on its own page; the board stays scannable. */}
                {entry.topSpeaker ? (
                  <p className="calendar-signal">
                    Best match:{" "}
                    <Link href={`/speakers/${entry.topSpeaker.id}`}>{entry.topSpeaker.name}</Link>{" "}
                    <span className="calendar-signal-score">{entry.topSpeaker.score}</span> ·{" "}
                    {entry.topSpeaker.title}, {entry.topSpeaker.company}
                  </p>
                ) : null}
              </div>

              <div className="calendar-side">
                <div className="calendar-counts">
                  <span>
                    <strong>{entry.speakerCount}</strong>
                    <small>speakers</small>
                  </span>
                  <span>
                    <strong>{entry.qualifiedCount}</strong>
                    <small>worth contacting</small>
                  </span>
                </div>

                <div className="calendar-watch">
                  <div className="calendar-watch-track" role="presentation">
                    <div className="calendar-watch-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {entry.lastCheckedAt
                      ? `Checked ${relativeTime(entry.lastCheckedAt, nowMs)}`
                      : "Not checked yet"}{" "}
                    · next check {dueIn(entry.nextCheckAt, nowMs)}
                  </small>
                </div>

                {entry.conferenceId ? (
                  <Link className="secondary-link" href={`/conferences/${entry.conferenceId}`}>
                    See speakers
                  </Link>
                ) : isExternal(entry.agendaUrl) ? (
                  <a
                    className="secondary-link"
                    href={entry.agendaUrl}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Visit event website
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
