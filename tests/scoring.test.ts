import { describe, expect, it } from "vitest";

import type { Speaker } from "@/lib/domain";
import { scoreSpeaker } from "@/lib/scoring";

function makeSpeaker(overrides: Partial<Speaker> = {}): Speaker {
  return {
    id: "speaker-1",
    conferenceId: "conference-1",
    name: "Jane Smith",
    title: "Advisor",
    company: "Example Company",
    sessionTitle: "Industry Outlook",
    score: 0,
    scoreReasons: [],
    dedupeKey: "jane-smith::example-company",
    ...overrides,
  };
}

describe("scoreSpeaker", () => {
  it("scores a VP engineering speaker on a specific data-center power topic", () => {
    const result = scoreSpeaker(
      makeSpeaker({
        title: "VP Engineering",
        company: "Frontier Power Development",
        sessionTitle: "Behind-the-Meter Gas Power for a 500 MW AI Campus in Texas",
      }),
    );

    expect(result.score).toBe(100);
    expect(result.reasons.map((reason) => reason.group)).toEqual([
      "seniority",
      "function",
      "company",
      "topic",
      "specificity",
    ]);
    expect(result.tier).toBe("high");
  });

  it("does not award one rule group more than once", () => {
    const result = scoreSpeaker(
      makeSpeaker({ title: "Chief VP, Head and Director of Engineering" }),
    );

    expect(result.reasons.filter((reason) => reason.group === "seniority")).toHaveLength(1);
    expect(result.score).toBe(45);
  });

  it("keeps a generic, non-buyer speaker in monitor", () => {
    const result = scoreSpeaker(makeSpeaker());

    expect(result).toEqual({ score: 0, reasons: [], tier: "monitor" });
  });
});
