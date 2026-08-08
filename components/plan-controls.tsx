"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  APPROVAL_LABELS,
  ATTENDANCE_LABELS,
  ATTENDANCE_STATUSES,
  type ApprovalStatus,
  type AttendanceStatus,
} from "@/lib/planning";

type PlanAction = Record<string, unknown> & { action: string };

function usePlanAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(payload: PlanAction) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { success: boolean; message?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "That did not work. Try again.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error };
}

function ErrorLine({ message }: { message: string }): ReactNode {
  return message ? <span className="plan-error">{message}</span> : null;
}

export function AttendanceControl({
  conferenceId,
  status,
}: {
  conferenceId: string;
  status: AttendanceStatus;
}) {
  const { run, busy, error } = usePlanAction();

  return (
    <div className="attendance-control">
      <span className="attendance-question" id={`attendance-${conferenceId}`}>
        Are you going?
      </span>
      <div className="attendance-options" role="group" aria-labelledby={`attendance-${conferenceId}`}>
        {ATTENDANCE_STATUSES.map((option) => (
          <button
            aria-pressed={status === option}
            className={`attendance-option${status === option ? " attendance-option-on" : ""}`}
            disabled={busy}
            key={option}
            onClick={() => void run({ action: "attendance", conferenceId, status: option })}
            type="button"
          >
            {ATTENDANCE_LABELS[option]}
          </button>
        ))}
      </div>
      <ErrorLine message={error} />
    </div>
  );
}

export function MeetToggle({
  speakerId,
  conferenceId,
  saved,
  speakerName,
}: {
  speakerId: string;
  conferenceId: string;
  saved: boolean;
  speakerName: string;
}) {
  const { run, busy, error } = usePlanAction();

  return (
    <>
      <button
        aria-label={
          saved
            ? `Remove ${speakerName} from your meet list`
            : `Add ${speakerName} to your meet list`
        }
        className={`meet-toggle${saved ? " meet-toggle-on" : ""}`}
        disabled={busy}
        onClick={() =>
          void run(
            saved
              ? { action: "meet-remove", speakerId }
              : { action: "meet-add", speakerId, conferenceId },
          )
        }
        type="button"
      >
        {saved ? "✓ On your list" : "＋ Meet"}
      </button>
      <ErrorLine message={error} />
    </>
  );
}

export function MeetNote({ speakerId, note }: { speakerId: string; note: string }) {
  const { run, busy, error } = usePlanAction();
  const [value, setValue] = useState(note);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="meet-note"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        void run({ action: "meet-note", speakerId, note: value }).then(() => setSaved(true));
      }}
    >
      <label htmlFor={`note-${speakerId}`}>What do you want to discuss?</label>
      <textarea
        id={`note-${speakerId}`}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        placeholder="e.g. Ask how they are powering the new Houston campus"
        rows={2}
        value={value}
      />
      <div className="meet-note-actions">
        <button className="primary-button" disabled={busy} type="submit">
          Save note
        </button>
        {saved ? <span className="plan-saved">Saved</span> : null}
        <ErrorLine message={error} />
      </div>
    </form>
  );
}

export function DraftApproval({
  stepId,
  speakerId,
  status,
}: {
  stepId: string;
  speakerId: string;
  status: ApprovalStatus;
}) {
  const { run, busy, error } = usePlanAction();

  return (
    <div className="draft-approval">
      <span className={`approval-pill approval-${status}`}>{APPROVAL_LABELS[status]}</span>
      <div className="approval-actions">
        {status !== "approved" ? (
          <button
            className="approve-button"
            disabled={busy}
            onClick={() => void run({ action: "approval", stepId, speakerId, status: "approved" })}
            type="button"
          >
            Approve
          </button>
        ) : null}
        {status !== "changes_requested" ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void run({ action: "approval", stepId, speakerId, status: "changes_requested" })
            }
            type="button"
          >
            Needs changes
          </button>
        ) : null}
        {status !== "pending" ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void run({ action: "approval", stepId, speakerId, status: "pending" })}
            type="button"
          >
            Undo
          </button>
        ) : null}
      </div>
      <ErrorLine message={error} />
    </div>
  );
}

export function StageAdvance({
  speakerId,
  stage,
  label,
}: {
  speakerId: string;
  stage: string;
  label: string;
}) {
  const { run, busy, error } = usePlanAction();

  return (
    <div className="stage-advance">
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => void run({ action: "advance-stage", speakerId, stage })}
        type="button"
      >
        Mark as {label}
      </button>
      <ErrorLine message={error} />
    </div>
  );
}
