import Link from "next/link";
import { notFound } from "next/navigation";

import { ScoreBadge } from "@/components/score-badge";
import { getRepository } from "@/lib/repository";
import { buildWhyNow } from "@/lib/sequence";

export const dynamic = "force-dynamic";

function offsetLabel(offset: number): string {
  return offset === 0 ? "EVENT" : `T${offset > 0 ? "+" : ""}${offset}`;
}

export default async function SpeakerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repository = getRepository();
  const rawId = id;
  const decodedId = decodeURIComponent(id);
  const encodedId = encodeURIComponent(id);

  let speaker =
    (await repository.getSpeaker(rawId)) ??
    (await repository.getSpeaker(decodedId)) ??
    (await repository.getSpeaker(encodedId));

  if (!speaker) {
    const allSpeakers = await repository.listSpeakers();
    speaker = allSpeakers.find(
      (s) =>
        s.id === rawId ||
        s.id === decodedId ||
        s.id === encodedId ||
        s.dedupeKey === rawId ||
        s.dedupeKey === decodedId ||
        s.id.endsWith(`:${rawId}`) ||
        s.id.endsWith(`:${decodedId}`),
    ) ?? null;
  }

  if (!speaker) notFound();
  const conference = await repository.getConference(speaker.conferenceId);
  if (!conference) notFound();
  const sequence = await repository.listSequence(speaker.id);
  const whyNow = buildWhyNow(speaker, conference);

  return (
    <div className="page-stack">
      <Link className="back-link" href={`/conferences/${conference.id}`}>← {conference.name}</Link>
      <header className="speaker-hero">
        <div>
          <p className="eyebrow">Qualified speaker / Signal brief</p>
          <h1>{speaker.name}</h1>
          <p className="role-line">{speaker.title} · {speaker.company}</p>
          {speaker.email && (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.9rem', color: '#a1a1aa' }}>
              <span>📧 {speaker.email}</span>
              {speaker.linkedinUrl && (
                <a href={speaker.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                  LinkedIn Profile ↗
                </a>
              )}
              {speaker.companyDomain && (
                <span style={{ color: '#71717a' }}>🌐 {speaker.companyDomain}</span>
              )}
            </div>
          )}
        </div>
        <ScoreBadge score={speaker.score} />
      </header>

      <section className="speaker-grid">
        <article className="why-now-card speaker-why-now">
          <p className="eyebrow">Why now?</p>
          <h2>{whyNow.daysUntil === 0 ? "The event is happening now." : `${whyNow.daysUntil} days to create relevance.`}</h2>
          <p className="signal-summary">{whyNow.summary}</p>
          <div className="recommended-action">
            <span>Recommended action</span>
            <strong>{whyNow.action}</strong>
          </div>
        </article>

        <article className="evidence-card">
          <p className="eyebrow">Contact & Score Evidence</p>
          <h2>Contact & Qualification Details</h2>
          <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div><strong>Email:</strong> <br/><span style={{ color: '#38bdf8' }}>{speaker.email || "Not derived"}</span></div>
              <div><strong>LinkedIn:</strong> <br/>{speaker.linkedinUrl ? <a href={speaker.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>LinkedIn ↗</a> : "N/A"}</div>
              <div><strong>Company Domain:</strong> <br/><span>{speaker.companyDomain || "N/A"}</span></div>
            </div>
          </div>
          <ul className="reason-list">
            {speaker.scoreReasons.map((reason) => (
              <li key={reason.group}>
                <span>+{reason.points}</span>
                <div><strong>{reason.reason}</strong><small>{reason.evidence}</small></div>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="session-callout">
        <span>SESSION SIGNAL</span>
        <h2>“{speaker.sessionTitle || "Session not yet published"}”</h2>
        <p>{conference.name} · {conference.location}</p>
      </section>

      <section className="sequence-panel" id="sequences">
        <div className="section-heading">
          <div><p className="eyebrow">GTM motion</p><h2>Conference-relative outreach</h2></div>
          <span className="draft-only">DRAFTS ONLY · NEVER SENT</span>
        </div>
        <div className="sequence-list">
          {sequence.map((step) => (
            <article className="sequence-step" data-testid="sequence-step" key={step.id}>
              <div className="sequence-offset">{offsetLabel(step.offsetDays)}</div>
              <div className="sequence-body">
                <div className="source-row">
                  <strong>{step.subject}</strong>
                  <span className={`status-pill status-${step.status}`}>{step.status}</span>
                </div>
                <small>{new Date(step.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {step.channel.replace("_", " ")}</small>
                <p>{step.message}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
