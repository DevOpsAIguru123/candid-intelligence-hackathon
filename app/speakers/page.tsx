import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { ScoreBadge } from "@/components/score-badge";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function SpeakersPage() {
  const repository = getRepository();
  const speakers = await repository.listSpeakers();
  const conferences = await repository.listConferences();

  const confMap = new Map(conferences.map((c) => [c.id, c.name]));
  const qualifiedCount = speakers.filter((s) => s.score >= 60).length;
  const highPriorityCount = speakers.filter((s) => s.score >= 80).length;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Origination / Speakers</p>
          <h1>Ranked Target Speakers</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {speakers.length} speaker{speakers.length === 1 ? "" : "s"} ranked
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard label="Total Identified" value={speakers.length} detail="Across all tracked conferences" />
        <MetricCard label="Qualified Speakers" value={qualifiedCount} detail="ICP score 60 or higher" />
        <MetricCard label="High Priority" value={highPriorityCount} detail="ICP score 80 or higher" accent />
        <MetricCard label="Top Signal Score" value={speakers[0]?.score ?? 0} detail="Highest ICP score" />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ranked Targets</p>
            <h2>Speakers Intelligence</h2>
          </div>
          <span className="table-count">{speakers.length} records</span>
        </div>

        {speakers.length === 0 ? (
          <p className="subtle-text">No speakers ingested yet. Use the homepage to ingest a conference agenda.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Speaker</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Session Signal</th>
                  <th>Conference</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {speakers.map((speaker) => (
                  <tr key={speaker.id}>
                    <td>
                      <ScoreBadge score={speaker.score} />
                    </td>
                    <td>
                      <strong>{speaker.name}</strong>
                      <div className="subtle-text">{speaker.title}</div>
                    </td>
                    <td>{speaker.company}</td>
                    <td>
                      {speaker.email ? (
                        <a className="text-link" href={`mailto:${speaker.email}`}>
                          {speaker.email}
                        </a>
                      ) : (
                        <span className="subtle-text">N/A</span>
                      )}
                    </td>
                    <td>{speaker.sessionTitle || "Session not published"}</td>
                    <td>{confMap.get(speaker.conferenceId) || "Conference"}</td>
                    <td>
                      <Link className="text-link" href={`/speakers/${encodeURIComponent(speaker.id)}`}>
                        Open signal brief →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
