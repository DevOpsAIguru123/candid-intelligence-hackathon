import { FunnelChart } from "@/components/funnel-chart";
import { MetricCard } from "@/components/metric-card";
import { calculateFunnel } from "@/lib/funnel";
import { getRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function FunnelPage() {
  const events = await getRepository().listFunnelEvents();
  const metrics = calculateFunnel(events);
  const entry = metrics[0]?.count ?? 0;
  const meetings = metrics.find((metric) => metric.stage === "meeting_scheduled")?.count ?? 0;
  const booked = metrics.at(-1)?.count ?? 0;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">Motion intelligence</p><h1>See exactly where momentum leaks.</h1></div>
        <div className="source-chip"><span className="live-dot" aria-hidden="true" /> Funnel live</div>
      </header>

      <section className="metric-grid metric-grid-three">
        <MetricCard label="Identified" value={entry} detail="People entering the motion" />
        <MetricCard label="Meetings" value={meetings} detail="Conference conversations planned" accent />
        <MetricCard label="Conversations booked" value={booked} detail="Post-event outcomes" />
      </section>

      <section className="table-panel funnel-panel">
        <div className="section-heading">
          <div><p className="eyebrow">Full sequence</p><h2>Conversion by stage</h2></div>
          <span className="table-count">8 stages</span>
        </div>
        <FunnelChart metrics={metrics} />
      </section>
    </div>
  );
}
