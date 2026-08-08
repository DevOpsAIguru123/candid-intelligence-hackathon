import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { ScoreBadge } from "@/components/score-badge";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const repository = getRepository();
  const speakers = await repository.listSpeakers();

  // Gather sequences for top qualified speakers
  const qualifiedSpeakers = speakers.filter((s) => s.score >= 60);

  const sequenceResults = await Promise.all(
    qualifiedSpeakers.map(async (speaker) => {
      const steps = await repository.listSequence(speaker.id);
      return steps.map((step) => ({
        ...step,
        speaker,
      }));
    })
  );
  const allSequenceItems = sequenceResults.flat();

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Origination / Sequences</p>
          <h1>Outreach Motion Sequences</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {allSequenceItems.length} sequence touchpoints active
        </div>
      </header>

      <section className="metric-grid">
        <MetricCard label="Qualified Speakers" value={qualifiedSpeakers.length} detail="ICP score 60 or higher" />
        <MetricCard label="Total Touchpoints" value={allSequenceItems.length} detail="Across email & LinkedIn" />
        <MetricCard label="Initial Day 0 Emails" value={allSequenceItems.filter((s) => s.offsetDays === 0).length} detail="Direct outbound initial hook" accent />
        <MetricCard label="Follow-Up Steps" value={allSequenceItems.filter((s) => s.offsetDays > 0).length} detail="Multi-touch drip steps" />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">5-Touch Drip Motion</p>
            <h2>Outreach Sequences</h2>
          </div>
          <span className="table-count">{allSequenceItems.length} touchpoints</span>
        </div>

        {allSequenceItems.length === 0 ? (
          <p className="subtle-text">No qualified outreach sequences found. Return to Overview to ingest speakers.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Target Speaker</th>
                  <th>Day Offset</th>
                  <th>Channel</th>
                  <th>Subject</th>
                  <th>Message Preview</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {allSequenceItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <ScoreBadge score={item.speaker.score} />
                    </td>
                    <td>
                      <strong>{item.speaker.name}</strong>
                      <div className="subtle-text">{item.speaker.company}</div>
                    </td>
                    <td>
                      <span className="pill pill-source">Day {item.offsetDays}</span>
                    </td>
                    <td>
                      <span className="pill" style={{ textTransform: "uppercase", fontSize: "0.75rem" }}>
                        {item.channel}
                      </span>
                    </td>
                    <td>
                      <strong>{item.subject}</strong>
                    </td>
                    <td style={{ maxWidth: "320px" }}>
                      <div className="subtle-text" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.message}
                      </div>
                    </td>
                    <td>
                      <Link className="text-link" href={`/speakers/${encodeURIComponent(item.speaker.id)}`}>
                        View brief →
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
