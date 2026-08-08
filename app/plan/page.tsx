import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { AttendanceControl, DraftApproval } from "@/components/plan-controls";
import { ScoreBadge } from "@/components/score-badge";
import { ATTENDANCE_LABELS, summarizePlan, type ApprovalStatus } from "@/lib/planning";
import { getPlanningRepository } from "@/lib/planning-repository";
import { getRepository } from "@/lib/conference-repository";

export const dynamic = "force-dynamic";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

export default async function PlanPage() {
  const repository = getRepository();
  const planning = getPlanningRepository();

  const conferences = await repository.listConferences();
  const meetList = planning.listMeetList();
  const attendance = planning.listAttendance();
  const approvals = planning.listApprovals();
  const approvalByStep = new Map(approvals.map((approval) => [approval.stepId, approval]));

  // Fetch only the people on the meet list. Loading every speaker in the
  // database, then a sequence for each, is thousands of queries on a real
  // conference and shows drafts for people nobody chose.
  const savedSpeakers = await Promise.all(
    meetList.map((entry) => repository.getSpeaker(entry.speakerId)),
  );
  const speakersById = new Map(
    savedSpeakers.filter((speaker) => speaker !== null).map((speaker) => [speaker.id, speaker]),
  );
  const sequenceLists = await Promise.all(
    [...speakersById.keys()].map(async (speakerId) =>
      (await repository.listSequence(speakerId)).map((step) => ({ step, speakerId })),
    ),
  );
  const drafts = sequenceLists.flat();
  // Count only entries whose speaker still resolves. A stale row would
  // otherwise report a person the page cannot show or let you remove.
  const resolvedMeetList = meetList.filter((entry) => speakersById.has(entry.speakerId));
  const summary = summarizePlan({
    attendance,
    meetList: resolvedMeetList,
    approvals,
    draftCount: drafts.length,
  });

  const attendanceByConference = new Map(
    attendance.map((entry) => [entry.conferenceId, entry.status]),
  );
  // Drafts for people you actually saved come first — the rest of the queue is
  // still there, just below the ones you care about.
  const savedSpeakerIds = new Set(meetList.map((entry) => entry.speakerId));
  const waiting = drafts
    .filter((draft) => (approvalByStep.get(draft.step.id)?.status ?? "pending") === "pending")
    .sort(
      (left, right) =>
        Number(savedSpeakerIds.has(right.speakerId)) - Number(savedSpeakerIds.has(left.speakerId)),
    );

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your plan</p>
          <h1>Events, people, sign-offs</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {summary.meetCount} {summary.meetCount === 1 ? "person" : "people"} to meet
        </div>
      </header>

      <section className="metric-grid" aria-label="Your plan at a glance">
        <MetricCard label="Events you are attending" value={summary.attendingCount} detail="Marked going in person" />
        <MetricCard label="People to meet" value={summary.meetCount} detail="Saved across all events" />
        <MetricCard label="Emails to approve" value={summary.awaitingApproval} detail="For people on your meet list" accent />
        <MetricCard label="Approved to send" value={summary.approved} detail="Cleared by a person" />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Events</p>
            <h2>Are you going?</h2>
          </div>
        </div>
        {conferences.length ? (
          <ul className="plan-event-list">
            {conferences.map((conference) => {
              const people = meetList.filter((entry) => entry.conferenceId === conference.id);
              return (
                <li key={conference.id}>
                  <div className="plan-event-head">
                    <div>
                      <Link className="plan-event-name" href={`/conferences/${conference.id}`}>
                        {conference.name}
                      </Link>
                      <p>
                        {formatDate(conference.startsAt)} · {conference.location} ·{" "}
                        {ATTENDANCE_LABELS[attendanceByConference.get(conference.id) ?? "undecided"]}
                      </p>
                    </div>
                    <AttendanceControl
                      conferenceId={conference.id}
                      status={attendanceByConference.get(conference.id) ?? "undecided"}
                    />
                  </div>

                  {people.length ? (
                    <ul className="plan-people">
                      {people.map((entry) => {
                        const speaker = speakersById.get(entry.speakerId);
                        if (!speaker) return null;
                        return (
                          <li data-testid="plan-person" key={entry.speakerId}>
                            <ScoreBadge score={speaker.score} />
                            <div>
                              <Link href={`/speakers/${speaker.id}`}>
                                <strong>{speaker.name}</strong>
                              </Link>
                              <small>
                                {speaker.title} · {speaker.company}
                              </small>
                              <p>{entry.note || "No talking points yet — open their profile to add one."}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="plan-empty">
                      Nobody saved yet. Open the event and press <strong>＋ Meet</strong> next to the
                      people you want to talk to.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="plan-empty">Analyze an event first and it will show up here.</p>
        )}
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Waiting on you</p>
            <h2>Emails to approve</h2>
          </div>
          <span className="draft-only">DRAFTS ONLY · NEVER SENT</span>
        </div>
        <p className="approval-explainer">
          Nothing here has been sent. Approving clears a draft; sending stays manual.
        </p>
        {waiting.length ? (
          <ul className="plan-draft-list">
            {waiting.slice(0, 12).map(({ step, speakerId }) => {
              const speaker = speakersById.get(speakerId);
              return (
                <li data-testid="plan-draft" key={step.id}>
                  <div>
                    <strong>{step.subject}</strong>
                    <small>
                      To {speaker?.name ?? "a speaker"} ·{" "}
                      {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
                        new Date(step.scheduledAt),
                      )}
                    </small>
                  </div>
                  <DraftApproval
                    speakerId={speakerId}
                    status={(approvalByStep.get(step.id)?.status ?? "pending") as ApprovalStatus}
                    stepId={step.id}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="plan-empty">Nothing is waiting for approval.</p>
        )}
        {waiting.length > 12 ? (
          <p className="plan-empty">Showing the first 12 of {waiting.length}.</p>
        ) : null}
      </section>
    </div>
  );
}
