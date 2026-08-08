import Link from "next/link";

import { MetricCard } from "@/components/metric-card";
import { ScoreBadge } from "@/components/score-badge";
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/domain";
import { getRepository } from "@/lib/conference-repository";
import { STAGE_LABELS } from "@/lib/planning";
import { getPlanningRepository } from "@/lib/planning-repository";

export const dynamic = "force-dynamic";

/**
 * Only the people you chose: saved to your meet list, or carrying a draft you
 * approved. The full list of every extracted speaker lives inside each event,
 * where it can be filtered and searched.
 */
export default async function SpeakersPage() {
  const repository = getRepository();
  const planning = getPlanningRepository();

  const meetList = planning.listMeetList();
  const approvals = planning.listApprovals();
  const approvedSpeakerIds = new Set(
    approvals.filter((approval) => approval.status === "approved").map((a) => a.speakerId),
  );
  const meetIds = new Set(meetList.map((entry) => entry.speakerId));
  const trackedIds = [...new Set([...meetIds, ...approvedSpeakerIds])];

  const [conferences, ...fetched] = await Promise.all([
    repository.listConferences(),
    ...trackedIds.map((id) => repository.getSpeaker(id)),
  ]);
  const speakers = fetched
    .filter((speaker) => speaker !== null)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  const confMap = new Map(conferences.map((conference) => [conference.id, conference.name]));
  const noteBySpeaker = new Map(meetList.map((entry) => [entry.speakerId, entry.note]));

  // Furthest step each tracked person has reached.
  const reached = new Map<string, FunnelStage>();
  if (speakers.length) {
    for (const event of await repository.listFunnelEvents()) {
      if (!meetIds.has(event.speakerId) && !approvedSpeakerIds.has(event.speakerId)) continue;
      const current = reached.get(event.speakerId);
      if (!current || FUNNEL_STAGES.indexOf(event.stage) > FUNNEL_STAGES.indexOf(current)) {
        reached.set(event.speakerId, event.stage);
      }
    }
  }

  const withContact = speakers.filter((speaker) => speaker.email || speaker.linkedinUrl).length;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Your people</p>
          <h1>Speakers you are tracking</h1>
        </div>
        <div className="source-chip">
          <span className="live-dot" aria-hidden="true" />
          {speakers.length} {speakers.length === 1 ? "person" : "people"}
        </div>
      </header>

      <section className="metric-grid metric-grid-three">
        <MetricCard label="On your meet list" value={meetIds.size} detail="Saved from an event" />
        <MetricCard
          label="With an approved email"
          value={approvedSpeakerIds.size}
          detail="Cleared by a person"
          accent
        />
        <MetricCard label="With contact details" value={withContact} detail="Email or LinkedIn found" />
      </section>

      <section className="table-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Tracked</p>
            <h2>Who you are meeting</h2>
          </div>
          <span className="table-count">{speakers.length} people</span>
        </div>

        {speakers.length === 0 ? (
          <p className="plan-empty">
            Nobody saved yet. Open an event from{" "}
            <Link className="inline-link" href="/conferences">
              Conferences
            </Link>{" "}
            and press <strong>＋ Meet</strong> next to the people worth talking to.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fit</th>
                  <th>Speaker</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>What to discuss</th>
                  <th>Event</th>
                  <th>Where they are</th>
                </tr>
              </thead>
              <tbody>
                {speakers.map((speaker) => {
                  const stage = reached.get(speaker.id);
                  return (
                    <tr data-testid="tracked-speaker" key={speaker.id}>
                      <td>
                        <ScoreBadge score={speaker.score} />
                      </td>
                      <td>
                        <Link
                          aria-label={`View ${speaker.name}`}
                          className="speaker-link"
                          href={`/speakers/${encodeURIComponent(speaker.id)}`}
                        >
                          <strong>{speaker.name}</strong>
                        </Link>
                        <small>{speaker.title}</small>
                      </td>
                      <td>{speaker.company}</td>
                      <td>
                        {speaker.email ? (
                          <a href={`mailto:${speaker.email}`}>{speaker.email}</a>
                        ) : speaker.linkedinUrl ? (
                          <a href={speaker.linkedinUrl} rel="noreferrer noopener" target="_blank">
                            LinkedIn ↗
                          </a>
                        ) : (
                          <span className="contact-missing">not found</span>
                        )}
                      </td>
                      <td>
                        {noteBySpeaker.get(speaker.id) || (
                          <span className="contact-missing">no talking points yet</span>
                        )}
                      </td>
                      <td>{confMap.get(speaker.conferenceId) ?? "Event"}</td>
                      <td>
                        <span className={`stage-chip${stage ? "" : " stage-chip-none"}`}>
                          {stage ? STAGE_LABELS[stage] : "not started"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
