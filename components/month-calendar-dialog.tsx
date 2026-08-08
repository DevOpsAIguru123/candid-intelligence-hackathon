"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildMonthGrid,
  monthKeyOf,
  shiftMonthKey,
  type CalendarEntry,
} from "@/lib/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="11" rx="2" stroke="currentColor" strokeWidth="1.4" width="13" x="1.5" y="3" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1.5v3M11 1.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function formatRange(entry: CalendarEntry): string {
  const start = new Date(entry.startsAt);
  const end = new Date(entry.endsAt || entry.startsAt);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return start.getTime() === end.getTime()
    ? day.format(start)
    : `${day.format(start)} – ${day.format(end)}`;
}

export function MonthCalendarDialog({ entries, nowIso }: { entries: CalendarEntry[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const firstUpcoming = entries.find((entry) => entry.status !== "past");
  const [open, setOpen] = useState(false);
  const [monthKey, setMonthKey] = useState(() => monthKeyOf(nowIso));
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const grid = useMemo(() => buildMonthGrid(entries, monthKey, now), [entries, monthKey, now]);
  const monthEntries = useMemo(() => {
    const seen = new Set<string>();
    return grid.weeks
      .flat()
      .flatMap((day) => day.entries)
      .filter((entry) => (seen.has(entry.key) ? false : seen.add(entry.key)));
  }, [grid]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="icon-button"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        title="Month view"
        type="button"
      >
        <CalendarIcon />
        <span>Month view</span>
      </button>

      {open ? (
        <div className="month-overlay" onClick={close} role="presentation">
          <div
            aria-labelledby="month-dialog-title"
            aria-modal="true"
            className="month-dialog"
            data-testid="month-dialog"
            onClick={(event) => event.stopPropagation()}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="month-dialog-head">
              <div>
                <p className="eyebrow">Calendar</p>
                <h2 id="month-dialog-title">{grid.label}</h2>
              </div>
              <div className="month-nav">
                <button
                  aria-label="Previous month"
                  onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
                  type="button"
                >
                  ‹
                </button>
                <button onClick={() => setMonthKey(monthKeyOf(nowIso))} type="button">
                  Today
                </button>
                {firstUpcoming ? (
                  <button
                    onClick={() => setMonthKey(monthKeyOf(firstUpcoming.startsAt))}
                    type="button"
                  >
                    Next event
                  </button>
                ) : null}
                <button
                  aria-label="Next month"
                  onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
                  type="button"
                >
                  ›
                </button>
                <button aria-label="Close month view" className="month-close" onClick={close} type="button">
                  ✕
                </button>
              </div>
            </header>

            <table className="month-grid">
              <caption className="sr-only">
                {grid.label}: {grid.eventCount} event{grid.eventCount === 1 ? "" : "s"}
              </caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((weekday) => (
                    <th key={weekday} scope="col">
                      <span aria-hidden="true">{weekday.slice(0, 1)}</span>
                      <span className="sr-only">{weekday}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.weeks.map((week) => (
                  <tr key={week[0].date}>
                    {week.map((day) => (
                      <td
                        className={`month-day${day.inMonth ? "" : " month-day-outside"}${
                          day.isToday ? " month-day-today" : ""
                        }`}
                        data-testid={day.entries.length ? "month-day-with-event" : undefined}
                        key={day.date}
                      >
                        <span className="month-day-number">{day.dayOfMonth}</span>
                        {day.entries.map((entry) =>
                          entry.conferenceId ? (
                            <Link
                              className={`month-chip chip-${entry.status}`}
                              href={`/conferences/${entry.conferenceId}`}
                              key={entry.key}
                            >
                              {entry.name}
                            </Link>
                          ) : (
                            <span className={`month-chip chip-${entry.status}`} key={entry.key}>
                              {entry.name}
                            </span>
                          ),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {monthEntries.length ? (
              <ul className="month-legend">
                {monthEntries.map((entry) => (
                  <li key={entry.key}>
                    <span className={`month-dot chip-${entry.status}`} aria-hidden="true" />
                    <strong>{entry.name}</strong>
                    <span>{formatRange(entry)}</span>
                    <span className="month-legend-meta">
                      {entry.dateConfidence === "confirmed" ? "dates confirmed" : "dates expected"} ·{" "}
                      {entry.location}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="month-empty">No events in {grid.label}.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
