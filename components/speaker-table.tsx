"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { MeetToggle, StageAdvance } from "@/components/plan-controls";
import { ScoreBadge } from "@/components/score-badge";
import type { FunnelStage } from "@/lib/domain";

export interface SpeakerRow {
  id: string;
  name: string;
  title: string;
  company: string;
  sessionTitle: string;
  /** Agenda detail, present once the source exposes sessions. */
  sessionWhen?: string;
  sessionRoom?: string;
  sessionTrack?: string;
  /** A slot the company paid for rather than earned. */
  sponsorSlot?: boolean;
  score: number;
  /** Where they are in the eight-step motion, if they have started it. */
  stage: FunnelStage | null;
  stageLabel: string;
  nextStage: FunnelStage | null;
  nextStageLabel: string;
  onMeetList: boolean;
}

type Filter = "all" | "worth" | "mine";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "worth", label: "Worth contacting" },
  { key: "mine", label: "On my list" },
];

export function SpeakerTable({
  conferenceId,
  speakers,
}: {
  conferenceId: string;
  speakers: SpeakerRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return speakers.filter((speaker) => {
      if (filter === "worth" && speaker.score < 60) return false;
      if (filter === "mine" && !speaker.onMeetList) return false;
      if (!needle) return true;
      return [speaker.name, speaker.company, speaker.title, speaker.sessionTitle]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [speakers, filter, query]);

  const counts = useMemo(
    () => ({
      all: speakers.length,
      worth: speakers.filter((speaker) => speaker.score >= 60).length,
      mine: speakers.filter((speaker) => speaker.onMeetList).length,
    }),
    [speakers],
  );

  return (
    <>
      <div className="speaker-toolbar">
        <div className="filter-tabs" role="group" aria-label="Filter speakers">
          {FILTERS.map((option) => (
            <button
              aria-pressed={filter === option.key}
              className={`filter-tab${filter === option.key ? " filter-tab-on" : ""}`}
              key={option.key}
              onClick={() => setFilter(option.key)}
              type="button"
            >
              {option.label} <span>{counts[option.key]}</span>
            </button>
          ))}
        </div>
        <div className="speaker-search">
          <label className="sr-only" htmlFor="speaker-search">
            Search speakers
          </label>
          <input
            id="speaker-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, company, or talk"
            type="search"
            value={query}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fit</th>
              <th>Speaker</th>
              <th>Company</th>
              <th>What they are speaking about</th>
              <th>Where they are</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((speaker) => (
              <tr data-testid="speaker-row" key={speaker.id}>
                <td>
                  <ScoreBadge score={speaker.score} />
                </td>
                <td>
                  <Link
                    aria-label={`View ${speaker.name}`}
                    className="speaker-link"
                    href={`/speakers/${speaker.id}`}
                  >
                    <strong>{speaker.name}</strong>
                  </Link>
                  <small>{speaker.title}</small>
                </td>
                <td>{speaker.company}</td>
                <td>
                  {speaker.sessionTitle || "Talk not announced yet"}
                  {speaker.sessionWhen || speaker.sessionRoom ? (
                    <small>
                      {[speaker.sessionWhen, speaker.sessionRoom, speaker.sessionTrack]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  ) : null}
                  {speaker.sponsorSlot ? <small className="role-flag">Sponsor slot</small> : null}
                </td>
                <td>
                  <span className={`stage-chip${speaker.stage ? "" : " stage-chip-none"}`}>
                    {speaker.stageLabel}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <MeetToggle
                      conferenceId={conferenceId}
                      saved={speaker.onMeetList}
                      speakerId={speaker.id}
                      speakerName={speaker.name}
                    />
                    {speaker.nextStage ? (
                      <StageAdvance
                        label={speaker.nextStageLabel}
                        speakerId={speaker.id}
                        stage={speaker.nextStage}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className="plan-empty">No speakers match that filter.</p>
        ) : null}
      </div>
    </>
  );
}
