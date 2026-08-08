import Link from "next/link";
import { notFound } from "next/navigation";

import { MetricCard } from "@/components/metric-card";
import { AttendanceControl } from "@/components/plan-controls";
import { SpeakerTable, type SpeakerRow } from "@/components/speaker-table";
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain";
import { nextFunnelStage } from "@/lib/funnel";
import { STAGE_LABELS } from "@/lib/planning";
import { cleanTrack, formatCoverage, formatSessionWhen, isSponsorSlot, primarySession } from "@/lib/sessions";
import { getPlanningRepository } from "@/lib/planning-repository";
import { getRepository } from "@/lib/conference-repository";
import { formatSourceMode } from "@/lib/source-mode";

export const dynamic = "force-dynamic";

export default async function ConferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const repository = getRepository();
  const conference = await repository.getConference(id);
  if (!conference) notFound();
  const speakers = await repository.listSpeakers(id);
  const qualified = speakers.filter((speaker) => speaker.score >= 60).length;

  const planning = getPlanningRepository();
  const attendance = planning.getAttendance(id);
  const meetList = new Set(planning.listMeetList(id).map((entry) => entry.speakerId));

  // Furthest step each speaker has reached, so the table can show progress and
  // offer the one next step without opening the profile.
  const reachedBySpeaker = new Map<string, FunnelStage>();
  for (const event of await repository.listFunnelEvents()) {
    const current = reachedBySpeaker.get(event.speakerId);
    if (!current || FUNNEL_STAGES.indexOf(event.stage) > FUNNEL_STAGES.indexOf(current)) {
      reachedBySpeaker.set(event.speakerId, event.stage);
    }
  }

  const rows: SpeakerRow[] = speakers.map((speaker) => {
    const stage = reachedBySpeaker.get(speaker.id) ?? null;
    const nextStage = stage ? nextFunnelStage(stage) : "identified";
    const session = primarySession(speaker.sessions);
    return {
      id: speaker.id,
      name: speaker.name,
      title: speaker.title,
      company: speaker.company,
      sessionTitle: session?.title || speaker.sessionTitle,
      sessionWhen: session ? formatSessionWhen(session, conference.timezone) : "",
      sessionRoom: session?.room ?? "",
      sessionTrack: cleanTrack(session?.track),
      sponsorSlot: isSponsorSlot(session?.role),
      score: speaker.score,
      stage,
      stageLabel: stage ? STAGE_LABELS[stage] : "not started",
      nextStage,
      nextStageLabel: nextStage ? STAGE_LABELS[nextStage] : "",
      onMeetList: meetList.has(speaker.id),
    };
  });

  return (
    <div className="page-stack">
      <Link className="back-link" href="/">← Back to overview</Link>
      <header className="conference-hero">
        <div>
          <div className="source-row">
            <span className={`mode-badge mode-${conference.sourceMode}`}>
              {formatSourceMode(conference.sourceMode)}
            </span>
            <span>Analyzed {new Date(conference.lastIngestedAt).toLocaleString("en-US")}</span>
            {formatCoverage(conference.coverage) ? (
              <span className="coverage-line">{formatCoverage(conference.coverage)}</span>
            ) : null}
          </div>
          <p className="eyebrow">Event</p>
          <h1>{conference.name}</h1>
          <p className="role-line">
            {conference.location} · {new Date(conference.startsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="hero-side">
          <AttendanceControl conferenceId={conference.id} status={attendance.status} />
          <div className="hero-signal">
            <span>Best score</span>
            <strong>{speakers[0]?.score ?? 0}</strong>
          </div>
        </div>
      </header>

      <section className="metric-grid metric-grid-three">
        <MetricCard label="Speakers found" value={speakers.length} detail="People listed on the agenda" />
        <MetricCard label="Worth contacting" value={qualified} detail="Fit score 60 or higher" />
        <MetricCard label="On your meet list" value={meetList.size} detail="People you want to talk to" accent />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Who to meet</p>
            <h2>Speakers</h2>
          </div>
          <span className="table-count">{speakers.length} people</span>

        </div>
        <SpeakerTable conferenceId={conference.id} speakers={rows} />
      </section>
    </div>
  );
}
