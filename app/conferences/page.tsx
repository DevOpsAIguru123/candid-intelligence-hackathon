import { CalendarBoard } from "@/components/calendar-board";
import { MetricCard } from "@/components/metric-card";
import { readCalendar } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

/**
 * The single events view. It was split across a calendar board and a separate
 * conferences list that read the same table; this is the board, which also
 * carries the month view and the drill-in to each event's speakers.
 */
export default async function ConferencesPage() {
  const payload = await readCalendar();
  const { summary } = payload;
  const nextEvent = summary.nextEvent;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Conferences</p>
          <h1>Events we are watching</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {summary.live} with speaker list{summary.live === 1 ? "" : "s"}
        </div>
      </header>

      <section className="metric-grid metric-grid-three" aria-label="Summary numbers">
        <MetricCard label="Events" value={summary.tracked} detail="Conferences in the database" />
        <MetricCard label="Speaker lists out" value={summary.live} detail="Speakers found and scored" />
        <MetricCard
          label="Next event"
          value={nextEvent ? (nextEvent.daysUntil <= 0 ? "Now" : `${nextEvent.daysUntil} days`) : "—"}
          detail={nextEvent ? nextEvent.name : "Nothing on the calendar yet"}
        />
      </section>

      <CalendarBoard initial={payload} />
    </div>
  );
}
