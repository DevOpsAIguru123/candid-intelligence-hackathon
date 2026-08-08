/**
 * The human layer on top of the automated intelligence: whether you are going
 * to an event, who you want to meet there, and which drafted emails a person
 * has actually approved.
 *
 * Nothing here sends anything. Approval marks a draft as cleared to send by a
 * human; the prototype has no email provider and never transmits a message.
 */

export type AttendanceStatus = "undecided" | "attending" | "not_attending";

export interface EventAttendance {
  conferenceId: string;
  status: AttendanceStatus;
  updatedAt: string;
}

export interface MeetListEntry {
  speakerId: string;
  conferenceId: string;
  /** What you want to talk to them about. */
  note: string;
  addedAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "changes_requested";

export interface DraftApproval {
  stepId: string;
  speakerId: string;
  status: ApprovalStatus;
  note: string;
  decidedAt: string;
}

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "attending",
  "undecided",
  "not_attending",
];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  attending: "Going in person",
  undecided: "Not decided",
  not_attending: "Not going",
};

/** Plain wording for the eight follow-up steps, shared by every screen. */
export const STAGE_LABELS: Record<string, string> = {
  identified: "found",
  qualified: "worth contacting",
  contacted: "emailed",
  replied: "replied",
  meeting_scheduled: "meeting set",
  met_at_event: "met at the event",
  follow_up_sent: "follow-up sent",
  conversation_booked: "conversation booked",
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved to send",
  changes_requested: "Needs changes",
};

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as string[]).includes(value);
}

export function isApprovalStatus(value: string): value is ApprovalStatus {
  return ["pending", "approved", "changes_requested"].includes(value);
}

/**
 * A draft may only leave the tool once a person has approved it. Anything
 * unreviewed or sent back for changes stays put — there is no implicit send.
 */
export function isClearedToSend(approval: DraftApproval | undefined): boolean {
  return approval?.status === "approved";
}

export interface PlanSummary {
  attendingCount: number;
  meetCount: number;
  awaitingApproval: number;
  approved: number;
}

export function summarizePlan(input: {
  attendance: EventAttendance[];
  meetList: MeetListEntry[];
  approvals: DraftApproval[];
  draftCount: number;
}): PlanSummary {
  const decided = new Map(input.approvals.map((approval) => [approval.stepId, approval]));
  const approved = [...decided.values()].filter((approval) => approval.status === "approved").length;
  const changesRequested = [...decided.values()].filter(
    (approval) => approval.status === "changes_requested",
  ).length;

  return {
    attendingCount: input.attendance.filter((entry) => entry.status === "attending").length,
    meetCount: input.meetList.length,
    // Anything a human has not cleared still needs a decision, including
    // drafts nobody has opened yet.
    awaitingApproval: input.draftCount - approved - changesRequested,
    approved,
  };
}
