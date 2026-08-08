import { describe, expect, it } from "vitest";

import type { SpeakerCandidate } from "@/lib/domain";
import { deduplicateSpeakers, normalizeSpeaker } from "@/lib/normalize";

function candidate(name: string, company: string): SpeakerCandidate {
  return {
    name,
    company,
    title: "VP Engineering",
    sessionTitle: "Behind-the-Meter Power for AI",
  };
}

describe("speaker normalization", () => {
  it("creates a stable key from normalized name and company", () => {
    expect(normalizeSpeaker(candidate(" Jane  Smith ", "ABC Energy, LLC")).dedupeKey).toBe(
      "jane-smith::abc-energy",
    );
  });

  it("normalizes published contact fields and defaults unavailable fields", () => {
    expect(
      normalizeSpeaker({
        ...candidate("Jane Smith", "ABC Energy"),
        email: " Jane.Smith@Example.com ",
        phone: " +1 555 0100 ",
        linkedinUrl: " https://www.linkedin.com/in/jane-smith ",
        profileUrl: " https://events.example/speakers/jane-smith ",
      }),
    ).toMatchObject({
      email: "jane.smith@example.com",
      phone: "+1 555 0100",
      linkedinUrl: "https://www.linkedin.com/in/jane-smith",
      profileUrl: "https://events.example/speakers/jane-smith",
    });

    expect(normalizeSpeaker(candidate("Alex Rivera", "Grid Co"))).toMatchObject({
      email: "",
      phone: "",
      linkedinUrl: "",
      profileUrl: "",
    });
  });

  it("merges confident within-conference name and company matches", () => {
    const result = deduplicateSpeakers([
      candidate(" Jane  Smith ", "ABC Energy, LLC"),
      candidate("jane smith", "ABC ENERGY"),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Jane Smith");
  });

  it("keeps same-name speakers at different companies separate", () => {
    expect(
      deduplicateSpeakers([
        candidate("Jane Smith", "ABC Energy"),
        candidate("Jane Smith", "XYZ Power"),
      ]),
    ).toHaveLength(2);
  });
});
