import { describe, expect, it } from "vitest";

import { researchTaskOutputSchema } from "@/lib/conference-intelligence";

const validOutput = {
  schemaVersion: "1.0",
  summary: "The official source confirms one capacity signal.",
  findings: [
    {
      category: "capacity",
      statement: "The source reports 1 GW of demand response.",
      attribution: "Official company announcement",
      evidenceUrl: "https://example.com/source",
      evidenceQuote: "We have integrated 1 GW of demand response capacity.",
    },
  ],
  unknowns: ["No supported kV figure was found."],
} as const;

describe("research task output contract", () => {
  it("accepts evidence-backed findings", () => {
    expect(researchTaskOutputSchema.parse(validOutput)).toEqual(validOutput);
  });

  it("rejects findings without a verbatim evidence quote", () => {
    const result = researchTaskOutputSchema.safeParse({
      ...validOutput,
      findings: [{ ...validOutput.findings[0], evidenceQuote: "" }],
    });

    expect(result.success).toBe(false);
  });

  it("requires HTTP evidence and at least one finding or unknown", () => {
    expect(
      researchTaskOutputSchema.safeParse({
        ...validOutput,
        findings: [{ ...validOutput.findings[0], evidenceUrl: "ftp://example.com/source" }],
      }).success,
    ).toBe(false);

    expect(
      researchTaskOutputSchema.safeParse({
        schemaVersion: "1.0",
        summary: "Research completed without supported details.",
        findings: [],
        unknowns: [],
      }).success,
    ).toBe(false);
  });
});
