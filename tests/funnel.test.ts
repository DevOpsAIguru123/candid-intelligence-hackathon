import { describe, expect, it } from "vitest";

import { FUNNEL_STAGES, type FunnelEvent, type FunnelStage } from "@/lib/domain";
import { calculateFunnel, nextFunnelStage } from "@/lib/funnel";

function makeEvents(counts: Partial<Record<FunnelStage, number>>): FunnelEvent[] {
  return FUNNEL_STAGES.flatMap((stage) =>
    Array.from({ length: counts[stage] ?? 0 }, (_, index) => ({
      id: `${stage}-${index}`,
      speakerId: `speaker-${index}`,
      stage,
      occurredAt: "2026-08-07T12:00:00.000Z",
    })),
  );
}

describe("funnel calculations", () => {
  it("calculates conversion and drop-off for every ordered stage", () => {
    const result = calculateFunnel(
      makeEvents({ identified: 10, qualified: 6, contacted: 3, replied: 2 }),
    );

    expect(result[1]).toMatchObject({
      stage: "qualified",
      count: 6,
      conversion: 60,
      dropoff: 4,
    });
    expect(result[2]).toMatchObject({
      stage: "contacted",
      count: 3,
      conversion: 50,
      dropoff: 3,
    });
    expect(result).toHaveLength(8);
  });

  it("allows only the immediate next stage", () => {
    expect(nextFunnelStage("contacted")).toBe("replied");
    expect(nextFunnelStage("conversation_booked")).toBeNull();
  });
});
