import { describe, expect, it } from "vitest";

import { createPlanningRepository } from "@/lib/planning-repository";
import { isClearedToSend, summarizePlan } from "@/lib/planning";

describe("draft clearance", () => {
  it("only treats an explicitly approved draft as cleared to send", () => {
    const base = { stepId: "step-1", speakerId: "speaker-1", note: "", decidedAt: "" };
    expect(isClearedToSend(undefined)).toBe(false);
    expect(isClearedToSend({ ...base, status: "pending" })).toBe(false);
    expect(isClearedToSend({ ...base, status: "changes_requested" })).toBe(false);
    expect(isClearedToSend({ ...base, status: "approved" })).toBe(true);
  });
});

describe("summarizePlan", () => {
  it("counts undecided drafts as still waiting on a human", () => {
    const summary = summarizePlan({
      attendance: [
        { conferenceId: "a", status: "attending", updatedAt: "" },
        { conferenceId: "b", status: "not_attending", updatedAt: "" },
      ],
      meetList: [{ speakerId: "s1", conferenceId: "a", note: "", addedAt: "" }],
      approvals: [
        { stepId: "d1", speakerId: "s1", status: "approved", note: "", decidedAt: "" },
        { stepId: "d2", speakerId: "s1", status: "changes_requested", note: "", decidedAt: "" },
      ],
      draftCount: 5,
    });

    expect(summary).toEqual({
      attendingCount: 1,
      meetCount: 1,
      awaitingApproval: 3,
      approved: 1,
    });
  });
});

describe("PlanningRepository", () => {
  it("records whether you are attending an event and lets you change your mind", () => {
    const repository = createPlanningRepository(":memory:");

    expect(repository.getAttendance("conf-1").status).toBe("undecided");

    repository.setAttendance("conf-1", "attending");
    expect(repository.getAttendance("conf-1").status).toBe("attending");

    repository.setAttendance("conf-1", "not_attending");
    expect(repository.getAttendance("conf-1").status).toBe("not_attending");
    expect(repository.listAttendance()).toHaveLength(1);
  });

  it("keeps a per-event list of people to meet with what to discuss", () => {
    const repository = createPlanningRepository(":memory:");

    repository.addToMeetList("speaker-1", "conf-1");
    repository.addToMeetList("speaker-2", "conf-1", "Ask about the 300 MW campus");
    repository.addToMeetList("speaker-3", "conf-2");

    expect(repository.listMeetList("conf-1")).toHaveLength(2);
    expect(repository.isOnMeetList("speaker-2")).toBe(true);
    expect(repository.setMeetNote("speaker-1", "Intro at the panel")?.note).toBe(
      "Intro at the panel",
    );

    repository.removeFromMeetList("speaker-1");
    expect(repository.isOnMeetList("speaker-1")).toBe(false);
    expect(repository.listMeetList()).toHaveLength(2);
  });

  it("stores one approval decision per draft and overwrites it on review", () => {
    const repository = createPlanningRepository(":memory:");

    repository.setApproval("step-1", "speaker-1", "approved");
    expect(isClearedToSend(repository.getApproval("step-1") ?? undefined)).toBe(true);

    repository.setApproval("step-1", "speaker-1", "changes_requested", "Too long");
    const revised = repository.getApproval("step-1");
    expect(revised).toMatchObject({ status: "changes_requested", note: "Too long" });
    expect(isClearedToSend(revised ?? undefined)).toBe(false);
    expect(repository.listApprovals("speaker-1")).toHaveLength(1);
  });
});
