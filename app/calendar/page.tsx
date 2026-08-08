import Link from "next/link";

import { CalendarBoard } from "@/components/calendar-board";
import { MetricCard } from "@/components/metric-card";
import { readCalendar } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  const payload = readCalendar();
  const { summary } = payload;
  const nextEvent = summary.nextEvent;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1>Events we are watching</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {summary.live} with speaker list{summary.live === 1 ? "" : "s"}
        </div>
      </header>

      <section className="metric-grid metric-grid-three" aria-label="Summary numbers">
        <MetricCard
          label="Events watched"
          value={summary.tracked}
          detail="Yearly events plus ones you analyzed"
        />
        <MetricCard label="Speaker lists out" value={summary.live} detail="Speakers found and scored" />
        <MetricCard
          label="Next event"
          value={nextEvent ? (nextEvent.daysUntil <= 0 ? "Now" : `${nextEvent.daysUntil} days`) : "—"}
          detail={nextEvent ? nextEvent.name : "Nothing on the calendar yet"}
        />
      </section>

      <CalendarBoard initial={payload} />

      <p className="calendar-footnote">
        These events repeat yearly, so expected dates appear before the organizer announces them.
        Dates are confirmed only after we read the real speaker list —{" "}
        <Link className="inline-link" href="/">
          analyze one
        </Link>
        .
      </p>
    </div>
  );
}
