import Link from "next/link";

import { IngestForm } from "@/components/ingest-form";
import { MetricCard } from "@/components/metric-card";
import { ScoreBadge } from "@/components/score-badge";
import { buildWhyNow } from "@/lib/sequence";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

export default function OverviewPage() {
  const repository = getRepository();
  const conferences = repository.listConferences();
  const speakers = repository.listSpeakers();
  const events = repository.listFunnelEvents();
  const topSpeaker = speakers[0];
  const topConference = topSpeaker ? repository.getConference(topSpeaker.conferenceId) : null;
  const whyNow = topSpeaker && topConference ? buildWhyNow(topSpeaker, topConference) : null;
  const qualified = speakers.filter((speaker) => speaker.score >= 60).length;
  const highPriority = speakers.filter((speaker) => speaker.score >= 80).length;
  const meetings = new Set(
    events.filter((event) => event.stage === "meeting_scheduled").map((event) => event.speakerId),
  ).size;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Origination / People</p>
          <h1>Find the right person before the opportunity is obvious.</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {conferences.length ? `${conferences.length} source${conferences.length === 1 ? "" : "s"} indexed` : "Engine ready"}
        </div>
      </header>

      <IngestForm />

      <section className="metric-grid" aria-label="Origination metrics">
        <MetricCard label="Upcoming conferences" value={conferences.length} detail="Public agendas tracked" />
        <MetricCard label="Qualified speakers" value={qualified} detail="ICP score 60 or higher" />
        <MetricCard label="High priority" value={highPriority} detail="ICP score 80 or higher" accent />
        <MetricCard label="Meetings" value={meetings} detail="Scheduled in the motion" />
      </section>

      {topSpeaker && topConference && whyNow ? (
        <section className="signal-grid" id="signals">
          <article className="why-now-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Why now?</p>
                <h2>{topSpeaker.name}</h2>
              </div>
              <ScoreBadge score={topSpeaker.score} />
            </div>
            <p className="role-line">{topSpeaker.title} · {topSpeaker.company}</p>
            <p className="signal-summary">{whyNow.summary}</p>
            <div className="recommended-action">
              <span>Recommended</span>
              <strong>{whyNow.action}</strong>
            </div>
            <Link className="primary-link" href={`/speakers/${topSpeaker.id}`}>
              Open signal brief →
            </Link>
          </article>

          <article className="conference-card" id="conferences">
            <div className="source-row">
              <span className={`mode-badge mode-${topConference.sourceMode}`}>
                {topConference.sourceMode === "demo" ? "DEMO DATA" : "LIVE SOURCE"}
              </span>
              <span>{formatDate(topConference.startsAt)}</span>
            </div>
            <p className="eyebrow">Upcoming target</p>
            <h2>{topConference.name}</h2>
            <p>{topConference.location}</p>
            <div className="conference-stat-row">
              <strong>{repository.listSpeakers(topConference.id).length}</strong>
              <span>speakers ranked</span>
            </div>
            <Link className="secondary-link" href={`/conferences/${topConference.id}`}>
              View conference intelligence
            </Link>
          </article>
        </section>
      ) : (
        <section className="empty-state" id="conferences">
          <span>01</span>
          <div>
            <h2>Your signal room is ready.</h2>
            <p>Analyze a public conference page or load the labeled demo to populate the full motion.</p>
          </div>
        </section>
      )}
    </div>
  );
}
