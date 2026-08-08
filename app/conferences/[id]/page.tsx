import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricCard } from "@/components/metric-card";
import { ScoreBadge } from "@/components/score-badge";
import { getRepository } from "@/lib/repository";
import { formatSourceMode } from "@/lib/source-mode";

export const dynamic = "force-dynamic";

export default async function ConferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getRepository();
  const conference = await repository.getConference(id);
  if (!conference) notFound();
  const speakers = await repository.listSpeakers(id);
  const qualified = speakers.filter((speaker) => speaker.score >= 60).length;
  const high = speakers.filter((speaker) => speaker.score >= 80).length;

  return (
    <div className="page-stack">
      <Link className="back-link" href="/">← Intelligence overview</Link>
      <header className="conference-hero">
        <div>
          <div className="source-row">
            <span className={`mode-badge mode-${conference.sourceMode}`}>
              {formatSourceMode(conference.sourceMode)}
            </span>
            <span>Ingested {new Date(conference.lastIngestedAt).toLocaleString("en-US")}</span>
          </div>
          <p className="eyebrow">Conference intelligence</p>
          <h1>{conference.name}</h1>
          <p className="role-line">
            {conference.location} · {new Date(conference.startsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="hero-signal">
          <span>Top signal</span>
          <strong>{speakers[0]?.score ?? 0}</strong>
        </div>
      </header>

      <section className="metric-grid metric-grid-three">
        <MetricCard label="Identified" value={speakers.length} detail="Credible speaker records" />
        <MetricCard label="Qualified" value={qualified} detail="Score 60 or higher" />
        <MetricCard label="High priority" value={high} detail="Score 80 or higher" accent />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ranked targets</p>
            <h2>Speakers</h2>
          </div>
          <span className="table-count">{speakers.length} records</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Score</th>
                <th>Speaker</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Session signal</th>
                <th><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {speakers.map((speaker) => (
                <tr key={speaker.id}>
                  <td><ScoreBadge score={speaker.score} /></td>
                  <td><strong>{speaker.name}</strong><small>{speaker.title}</small></td>
                  <td>{speaker.company}</td>
                  <td><small style={{ color: '#38bdf8' }}>{speaker.email || "N/A"}</small></td>
                  <td>{speaker.sessionTitle || "Session not published"}</td>
                  <td>
                    <Link aria-label={`View ${speaker.name}`} className="row-link" href={`/speakers/${encodeURIComponent(speaker.id)}`}>
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
