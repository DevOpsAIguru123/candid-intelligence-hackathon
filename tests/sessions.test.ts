import { describe, expect, it } from "vitest";

import type { SpeakerSession } from "@/lib/domain";
import {
  cleanTrack,
  formatCoverage,
  formatRole,
  formatSessionWhen,
  isSponsorSlot,
  primarySession,
} from "@/lib/sessions";

function session(overrides: Partial<SpeakerSession> = {}): SpeakerSession {
  return {
    id: "session-1",
    title: "Engineering Onsite Power for AI Data Centers",
    startsAt: "2026-09-22T13:45:00.000Z",
    endsAt: "2026-09-22T14:30:00.000Z",
    room: "Longhorn B",
    track: "Other",
    sessionType: "Session",
    role: "Speaker",
    evidenceUrl: "https://schedule.example/session/1",
    ...overrides,
  };
}

describe("cleanTrack", () => {
  it("drops the sentence the agenda source writes when there is no track", () => {
    expect(cleanTrack("No tracks found for this session")).toBe("");
    expect(cleanTrack("  ")).toBe("");
    expect(cleanTrack("Power & Cooling")).toBe("Power & Cooling");
  });
});

describe("roles", () => {
  it("separates a bought sponsor slot from an earned speaking slot", () => {
    expect(isSponsorSlot("Sponsor Speaker")).toBe(true);
    expect(isSponsorSlot("Speaker")).toBe(false);
    expect(formatRole("Speaker")).toBe("");
    expect(formatRole("Description Speaker")).toBe("Named in the description");
  });
});

describe("formatSessionWhen", () => {
  it("shows venue local time when the timezone is known", () => {
    expect(formatSessionWhen(session(), "America/Chicago")).toBe("Tue, Sep 22 · 8:45 AM");
  });

  it("falls back to UTC and labels it rather than showing a wrong local time", () => {
    expect(formatSessionWhen(session())).toBe("Tue, Sep 22 · 1:45 PM UTC");
  });

  it("says so when the source published no usable time", () => {
    expect(formatSessionWhen(session({ startsAt: "not-a-date" }))).toBe("Time not published");
  });
});

describe("primarySession", () => {
  it("prefers an earned slot over a sponsor slot", () => {
    const chosen = primarySession([
      session({ id: "sponsored", role: "Sponsor Speaker", startsAt: "2026-09-21T13:00:00.000Z" }),
      session({ id: "earned", role: "Speaker", startsAt: "2026-09-23T13:00:00.000Z" }),
    ]);
    expect(chosen?.id).toBe("earned");
  });

  it("returns nothing when the source exposed no sessions", () => {
    expect(primarySession()).toBeNull();
    expect(primarySession([])).toBeNull();
  });
});

describe("formatCoverage", () => {
  it("states how much of the agenda was actually read", () => {
    expect(
      formatCoverage({
        expectedSessions: 48,
        extractedSessions: 48,
        expectedTotalSpeakers: 80,
        totalSpeakers: 80,
        structuredAgendaSpeakers: 73,
        descriptionOnlySpeakers: 7,
      }),
    ).toBe("48 of 48 sessions read · 80 of 80 speakers extracted");
    expect(formatCoverage(undefined)).toBeNull();
  });
});
