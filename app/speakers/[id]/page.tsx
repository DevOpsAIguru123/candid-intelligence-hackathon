import Link from "next/link";
import { notFound } from "next/navigation";

import {
  DraftApproval,
  MeetNote,
  MeetToggle,
  StageAdvance,
} from "@/components/plan-controls";
import { ScoreBadge } from "@/components/score-badge";
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain";
import { nextFunnelStage } from "@/lib/funnel";
import { getPlanningRepository } from "@/lib/planning-repository";
import { STAGE_LABELS, type ApprovalStatus } from "@/lib/planning";
import {
  cleanTrack,
  formatRole,
  formatSessionWhen,
  isSponsorSlot,
  primarySession,
} from "@/lib/sessions";
import { getRepository } from "@/lib/conference-repository";
import { buildWhyNow } from "@/lib/sequence";

export const dynamic = "force-dynamic";

/** Plain wording for the send date relative to the event. */
function offsetLabel(offset: number): string {
  if (offset === 0) return "At the event";
  const days = Math.abs(offset);
  const when = offset < 0 ? "before" : "after";
  if (days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} week${weeks === 1 ? "" : "s"} ${when}`;
  }
  return `${days} day${days === 1 ? "" : "s"} ${when}`;
}

/** Plain wording for the stored draft status. */
const STATUS_LABELS: Record<string, string> = {
  drafted: "Ready",
  pending: "Scheduled",
  complete: "Sent",
};

export default async function SpeakerPage({ params }: { params: Promise<{ id: string }> }) {
  // Next hands back the raw path segment, so ids containing ":" arrive
  // percent-encoded. Real speaker ids look like "<conference>:speaker:83300".
  const { id } = await params;
  const repository = getRepository();
  const speaker = await repository.getSpeaker(decodeURIComponent(id));
  if (!speaker) notFound();
  const conference = await repository.getConference(speaker.conferenceId);
  if (!conference) notFound();
  const sequence = await repository.listSequence(speaker.id);
  const whyNow = buildWhyNow(speaker, conference);
  const session = primarySession(speaker.sessions);

  const planning = getPlanningRepository();
  const meetEntry = planning.listMeetList().find((entry) => entry.speakerId === speaker.id);
  const approvals = new Map(
    planning.listApprovals(speaker.id).map((approval) => [approval.stepId, approval]),
  );

  const reached = (await repository.listFunnelEvents())
    .filter((event) => event.speakerId === speaker.id)
    .reduce<FunnelStage | null>(
      (latest, event) =>
        !latest || FUNNEL_STAGES.indexOf(event.stage) > FUNNEL_STAGES.indexOf(latest)
          ? event.stage
          : latest,
      null,
    );
  const upcomingStage = reached ? nextFunnelStage(reached) : "identified";

  return (
    <div className="page-stack">
      <Link className="back-link" href={`/conferences/${conference.id}`}>← {conference.name}</Link>
      <header className="speaker-hero">
        <div>
          <p className="eyebrow">Speaker profile</p>
          <h1>{speaker.name}</h1>
          <p className="role-line">{speaker.title} · {speaker.company}</p>
          <div className="hero-actions">
            <MeetToggle
              conferenceId={conference.id}
              saved={Boolean(meetEntry)}
              speakerId={speaker.id}
              speakerName={speaker.name}
            />
            {upcomingStage ? (
              <StageAdvance
                label={STAGE_LABELS[upcomingStage]}
                speakerId={speaker.id}
                stage={upcomingStage}
              />
            ) : (
              <span className="plan-saved">Conversation booked — the motion is complete</span>
            )}
          </div>
          <p className="stage-line">
            Where they are now: <strong>{reached ? STAGE_LABELS[reached] : "not started"}</strong>
          </p>
        </div>
        <ScoreBadge score={speaker.score} />
      </header>

      {meetEntry ? (
        <section className="session-callout meet-panel">
          <span>ON YOUR MEET LIST</span>
          <MeetNote note={meetEntry.note} speakerId={speaker.id} />
        </section>
      ) : null}

      {/* Why now and the session sit in one column so the taller evidence card
          beside them does not leave a hole in the page. */}
      <section className="speaker-grid">
        <div className="speaker-column">
          <article className="why-now-card speaker-why-now">
            <p className="eyebrow">Why now?</p>
            <h2>
              {whyNow.daysUntil === 0
                ? "The event is happening now."
                : `${whyNow.daysUntil} days until the event.`}
            </h2>
            <p className="signal-summary">{whyNow.summary}</p>
            <div className="recommended-action">
              <span>Recommended action</span>
              <strong>{whyNow.action}</strong>
            </div>
          </article>

          <section className="session-callout">
            <span>WHAT THEY ARE SPEAKING ABOUT</span>
            <h2>“{session?.title || speaker.sessionTitle || "Talk not announced yet"}”</h2>
            {session ? (
              <>
                <p className="session-when">
                  <strong>{formatSessionWhen(session, conference.timezone)}</strong>
                  {session.room ? <> · {session.room}</> : null}
                  {cleanTrack(session.track) ? <> · {cleanTrack(session.track)}</> : null}
                  {session.sessionType ? <> · {session.sessionType}</> : null}
                </p>
                {formatRole(session.role) ? (
                  <p className="session-role">
                    <span className={isSponsorSlot(session.role) ? "role-flag" : "role-note"}>
                      {formatRole(session.role)}
                    </span>
                    {isSponsorSlot(session.role)
                      ? " — a paid slot, not an invited one."
                      : " — found in the session description rather than the speaker list."}
                  </p>
                ) : null}
                {session.description ? <p className="session-blurb">{session.description}</p> : null}
                <p className="session-source">
                  {conference.name} · {conference.location}
                  {session.evidenceUrl ? (
                    <>
                      {" · "}
                      <a href={session.evidenceUrl} rel="noreferrer noopener" target="_blank">
                        Source ↗
                      </a>
                    </>
                  ) : null}
                </p>
                {(speaker.sessions?.length ?? 0) > 1 ? (
                  <p className="session-source">
                    Also speaking on {(speaker.sessions?.length ?? 1) - 1} other session
                    {(speaker.sessions?.length ?? 1) - 1 === 1 ? "" : "s"}.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="session-source">{conference.name} · {conference.location}</p>
            )}
          </section>
        </div>

        <article className="evidence-card">
          <p className="eyebrow">Why this score</p>
          <h2>Why this person matters</h2>
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

      <section className="sequence-panel" id="sequences">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Outreach plan</p>
            <h2>Emails timed around the event</h2>
          </div>
          <span className="draft-only">DRAFTS ONLY · NEVER SENT</span>
        </div>
        <p className="approval-explainer">
          Drafts only. Approving marks one ready for you to send — this tool never sends.
        </p>
        <div className="sequence-list">
          {sequence.map((step) => (
            <article className="sequence-step" data-testid="sequence-step" key={step.id}>
              <div className="sequence-offset">{offsetLabel(step.offsetDays)}</div>
              <div className="sequence-body">
                <div className="source-row">
                  <strong>{step.subject}</strong>
                  <span className={`status-pill status-${step.status}`}>
                    {STATUS_LABELS[step.status] ?? step.status}
                  </span>
                </div>
                <DraftApproval
                  speakerId={speaker.id}
                  status={(approvals.get(step.id)?.status ?? "pending") as ApprovalStatus}
                  stepId={step.id}
                />
                <small>
                  {new Date(step.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                  {step.channel === "in_person" ? "in person" : "email"}
                </small>
                <p>{step.message}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
