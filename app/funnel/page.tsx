import { FunnelChart } from "@/components/funnel-chart";
import { calculateFunnel } from "@/lib/funnel";
import { getRepository } from "@/lib/conference-repository";

export const dynamic = "force-dynamic";

// The chart already prints every count, so this page carries no metric cards.
export default async function FunnelPage() {
  const metrics = calculateFunnel(await getRepository().listFunnelEvents());


  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Outreach</p>
          <h1>Where people drop off</h1>
        </div>
        <div className="source-chip"><span className="live-dot" aria-hidden="true" /> Live</div>
      </header>

      <section className="table-panel funnel-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Every step</p>
            <h2>People at each step</h2>
          </div>
          <span className="table-count">8 steps</span>
        </div>
        <FunnelChart metrics={metrics} />
      </section>
    </div>
  );
}
