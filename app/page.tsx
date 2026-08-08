import Link from "next/link";

import { IngestForm } from "@/components/ingest-form";
import { ScoreBadge } from "@/components/score-badge";
import type { Conference } from "@/lib/domain";
import { buildWhyNow } from "@/lib/sequence";
import { getPlanningRepository } from "@/lib/planning-repository";
import { getRepository } from "@/lib/conference-repository";

export const dynamic = "force-dynamic";

/** Kept out of the component body so the render itself stays pure. */
function pickNextConference(conferences: Conference[]): Conference | undefined {
  const now = Date.now();
  return conferences.find((conference) => Date.parse(conference.startsAt) >= now) ?? conferences[0];
}

/**
 * The overview answers one question: what should I do next? Every count lives
 * on the page that owns it — events on the calendar, people on the event page,
 * decisions on the plan, outcomes on progress — so nothing is repeated here.
 */
export default async function OverviewPage() {
  const repository = getRepository();
  const planning = getPlanningRepository();

  const nextConference = pickNextConference(await repository.listConferences());
  const topSpeaker = nextConference ? (await repository.listSpeakers(nextConference.id))[0] : undefined;
  const whyNow = topSpeaker && nextConference ? buildWhyNow(topSpeaker, nextConference) : null;

  // Only the people you saved. Counting drafts for every speaker in the
  // database meant one query per speaker — thousands of them on a real
  // conference — and told you nothing you act on.
  const meetList = planning.listMeetList();
  const decided = new Set(
    planning
      .listApprovals()
      .filter((approval) => approval.status !== "pending")
      .map((approval) => approval.stepId),
  );
  const sequences = await Promise.all(
    meetList.map((entry) => repository.listSequence(entry.speakerId)),
  );
  const meetCount = meetList.length;
  const awaiting = sequences.flat().filter((step) => !decided.has(step.id)).length;


  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Start here</p>
          <h1>Who to meet next</h1>
        </div>
      </header>

      <IngestForm />

      {topSpeaker && nextConference && whyNow ? (
        <section className="next-action" aria-label="Do this next">
          <div className="next-action-copy">
            <p className="eyebrow">Do this next</p>
            <h2>{whyNow.action}</h2>
            <p className="next-action-detail">
              <strong>{topSpeaker.name}</strong> · {topSpeaker.title}, {topSpeaker.company} ·
              speaking at {nextConference.name} in {whyNow.daysUntil} days.
            </p>
            <Link className="primary-link" href={`/speakers/${topSpeaker.id}`}>
              Open profile →
            </Link>
          </div>
          <ScoreBadge score={topSpeaker.score} />

        </section>
      ) : (
        <section className="empty-state">
          <span>01</span>
          <div>
            <h2>Nothing analyzed yet.</h2>
            <p>Paste a public conference link above to pull in its speakers and score them.</p>
          </div>
        </section>
      )}

      {awaiting || meetCount ? (
        <p className="waiting-line">
          Waiting on you: <strong>{awaiting}</strong> {awaiting === 1 ? "email" : "emails"} to
          approve · <strong>{meetCount}</strong> {meetCount === 1 ? "person" : "people"} to meet.{" "}
          <Link className="inline-link" href="/plan">
            Open your plan
          </Link>
        </p>
      ) : null}
    </div>
  );
}
