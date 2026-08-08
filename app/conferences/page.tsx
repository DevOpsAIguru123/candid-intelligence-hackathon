import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { getRepository } from "@/lib/repository";
import { formatSourceMode } from "@/lib/source-mode";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

export default async function ConferencesPage() {
  const repository = getRepository();
  const conferences = await repository.listConferences();
  const allSpeakers = await repository.listSpeakers();

  const confSpeakerCounts = await Promise.all(
    conferences.map(async (conf) => {
      const confSpeakers = await repository.listSpeakers(conf.id);
      return [conf.id, confSpeakers.length] as const;
    })
  );
  const speakerCountMap = new Map(confSpeakerCounts);

  const totalQualified = allSpeakers.filter((s) => s.score >= 60).length;
  const totalHighPriority = allSpeakers.filter((s) => s.score >= 80).length;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Origination / Conferences</p>
          <h1>Tracked Conference Agendas</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {conferences.length} conference{conferences.length === 1 ? "" : "s"} indexed
        </div>
      </header>

      <section className="metric-grid metric-grid-three">
        <MetricCard label="Tracked Conferences" value={conferences.length} detail="Public agendas parsed" />
        <MetricCard label="Qualified Speakers" value={totalQualified} detail="ICP score 60 or higher" />
        <MetricCard label="High Priority Targets" value={totalHighPriority} detail="ICP score 80 or higher" accent />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Public Agendas</p>
            <h2>All Conferences</h2>
          </div>
          <span className="table-count">{conferences.length} records</span>
        </div>

        {conferences.length === 0 ? (
          <p className="subtle-text">No conferences indexed yet. Return to Overview to paste a conference URL.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Conference</th>
                  <th>Location & Dates</th>
                  <th>Source Mode</th>
                  <th>Speakers</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {conferences.map((conf) => (
                  <tr key={conf.id}>
                    <td>
                      <strong>{conf.name}</strong>
                      <div style={{ fontSize: "0.825rem", color: "var(--muted)" }}>{conf.sourceUrl}</div>
                    </td>
                    <td>
                      {conf.location} • {formatDate(conf.startsAt)}
                    </td>
                    <td>
                      <span className="pill pill-source">{formatSourceMode(conf.sourceMode)}</span>
                    </td>
                    <td>
                      <strong>{speakerCountMap.get(conf.id) ?? 0}</strong> speakers
                    </td>
                    <td>
                      <Link className="text-link" href={`/conferences/${encodeURIComponent(conf.id)}`}>
                        View intelligence →
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
