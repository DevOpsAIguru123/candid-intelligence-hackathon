import type { FunnelMetric } from "@/lib/funnel";

function label(stage: string): string {
  const words = stage.replaceAll("_", " ");
  return words[0].toUpperCase() + words.slice(1);
}

export function FunnelChart({ metrics }: { metrics: FunnelMetric[] }) {
  const maxCount = Math.max(...metrics.map((metric) => metric.count), 1);

  return (
    <div className="funnel-chart" aria-label="Outreach conversion funnel">
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
              {index === 0 ? "Entry point" : `${metric.conversion}% conversion · ${metric.dropoff} lost`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
