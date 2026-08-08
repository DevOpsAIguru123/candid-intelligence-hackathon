import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AnalyzeAgenda } from "@/components/analyze-agenda";
import { MetricCard } from "@/components/metric-card";
import { readCalendar } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

function formatWindow(startsAt: string, endsAt: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return startsAt === endsAt ? format.format(new Date(startsAt)) : `${format.format(new Date(startsAt))} – ${format.format(new Date(endsAt))}`;
}

/**
 * A watched event we have not read yet. Once its speaker list is analyzed the
 * event lives at /conferences/[id], so this page forwards there rather than
 * becoming a second version of the same screen.
 */
export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId: rawSeriesId } = await params;
  const seriesId = decodeURIComponent(rawSeriesId);
  const entry = (await readCalendar()).entries.find(
    (candidate) => candidate.seriesId === seriesId || candidate.key === seriesId,
  );
  if (!entry) notFound();
  if (entry.conferenceId) redirect(`/conferences/${entry.conferenceId}`);

  return (
    <div className="page-stack">
      <Link className="back-link" href="/calendar">← Back to calendar</Link>

      <header className="conference-hero">
        <div>
          <div className="source-row">
            <span className="calendar-status calendar-status-tracking">WATCHING</span>
            <span className={`calendar-lens lens-${entry.lens}`}>
              {entry.lens === "core" ? "BEST FIT" : "POSSIBLE FIT"}
            </span>
          </div>
          <p className="eyebrow">Event</p>
          <h1>{entry.name}</h1>
          <p className="role-line">
            {formatWindow(entry.startsAt, entry.endsAt)} · {entry.location} · {entry.organizer}
          </p>
          <p className="series-note">{entry.note}</p>
        </div>
        <div className="hero-signal">
          <span>Days away</span>
          <strong>{entry.daysUntil}</strong>
        </div>
      </header>

      <section className="metric-grid metric-grid-three">
        <MetricCard
          label="Dates"
          value={entry.dateConfidence === "confirmed" ? "Confirmed" : "Expected"}
          detail={
            entry.dateConfidence === "confirmed"
              ? "Taken from the event's own page"
              : "Based on when it usually runs"
          }
        />
        <MetricCard label="Speakers found" value={entry.speakerCount} detail="Nothing read yet" />
        <MetricCard
          label="Next check"
          value={entry.lastCheckedAt ? "Scheduled" : "Due now"}
          detail="How often we look for the speaker list"
          accent
        />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Speakers</p>
            <h2>No speaker list yet</h2>
          </div>
        </div>
        <p className="approval-explainer">
          Read the agenda now and every speaker lands here with a fit score.
        </p>
        <div className="series-actions">
          <AnalyzeAgenda agendaUrl={entry.agendaUrl} />
          <a
            className="secondary-link"
            href={entry.agendaUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            Visit event website ↗
          </a>
        </div>
      </section>
    </div>
  );
}
