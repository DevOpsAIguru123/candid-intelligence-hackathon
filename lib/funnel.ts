import { FUNNEL_STAGES, type FunnelEvent, type FunnelStage } from "@/lib/domain";

export interface FunnelMetric {
  stage: FunnelStage;
  count: number;
  conversion: number;
  dropoff: number;
  dropoffPercent: number;
}

export function calculateFunnel(events: FunnelEvent[]): FunnelMetric[] {
  const counts = new Map<FunnelStage, Set<string>>(
    FUNNEL_STAGES.map((stage) => [stage, new Set<string>()]),
  );

  for (const event of events) {
    counts.get(event.stage)?.add(event.speakerId);
  }

  return FUNNEL_STAGES.map((stage, index) => {
    const count = counts.get(stage)?.size ?? 0;
    if (index === 0) {
      return { stage, count, conversion: count > 0 ? 100 : 0, dropoff: 0, dropoffPercent: 0 };
    }

    const previousCount = counts.get(FUNNEL_STAGES[index - 1])?.size ?? 0;
    const dropoff = Math.max(0, previousCount - count);

    return {
      stage,
      count,
      conversion: previousCount === 0 ? 0 : Math.round((count / previousCount) * 100),
      dropoff,
      dropoffPercent: previousCount === 0 ? 0 : Math.round((dropoff / previousCount) * 100),
    };
  });
}

export function nextFunnelStage(current: FunnelStage): FunnelStage | null {
  const index = FUNNEL_STAGES.indexOf(current);
  return index < 0 || index === FUNNEL_STAGES.length - 1 ? null : FUNNEL_STAGES[index + 1];
}
