import type { FunnelMetric } from "@/lib/funnel";

/** Plain-language names for the stored stage keys. */
const STAGE_LABELS: Record<string, string> = {
  identified: "Found",
  qualified: "Worth contacting",
  contacted: "Emailed",
  replied: "Replied",
  meeting_scheduled: "Meeting set",
  met_at_event: "Met at the event",
  follow_up_sent: "Follow-up sent",
  conversation_booked: "Conversation booked",
};

function label(stage: string): string {
  if (STAGE_LABELS[stage]) return STAGE_LABELS[stage];
  const words = stage.replaceAll("_", " ");
  return words[0].toUpperCase() + words.slice(1);
}

export function FunnelChart({ metrics }: { metrics: FunnelMetric[] }) {
  const maxCount = Math.max(...metrics.map((metric) => metric.count), 1);

  return (
    <div className="funnel-chart" aria-label="Outreach progress by step">
      {metrics.map((metric, index) => {
        const width = Math.max(36, (metric.count / maxCount) * 100);
        return (
          <div className="funnel-row" key={metric.stage} data-testid="funnel-stage">
            <div className="funnel-copy">
              <span>{label(metric.stage)}</span>
              <strong>{metric.count}</strong>
            </div>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="funnel-meta">
              {index === 0
                ? "Starting point"
                : `${metric.conversion}% carried on · ${metric.dropoff} dropped off`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
