import { InsightList } from '@/components/panels/InsightList';
import type { ImprovementDTO } from '@/lib/ui/view-models';

export function PerformanceInsights({ strengths, improvements, organization = false }: { strengths: ImprovementDTO[]; improvements: ImprovementDTO[]; organization?: boolean }) {
  return <section className="performance-insights">
    <div className="section-heading">
      <div><span className="page-kicker">Evidence-grounded insights</span><h2>What is working—and what will move the index next</h2><p>{organization ? 'Employee narratives are rolled up from the latest scored run; each remains tied to its real KPI evidence.' : 'Narration explains deterministic KPI evidence. It never computes or changes your score.'}</p></div>
      <span className="count-badge">latest completed pipeline run</span>
    </div>
    <div className="personal-signal-grid">
      <article className="card"><div className="cardhead"><h3>Going well</h3><span className="sub">behaviors supporting strong sub-indexes</span></div><InsightList items={strengths} emptyHint="a win appears when a KPI reaches its configured target" /></article>
      <article className="card"><div className="cardhead"><h3>Needs improvement</h3><span className="sub">ranked by deterministic estimated impact</span></div><InsightList items={improvements} emptyHint="an improvement appears after the first real scored window" /></article>
    </div>
    <p className="insight-schedule-note">The durable pipeline runs daily at 06:00 UTC (11:30 IST) and can also be run on demand. New GitHub or coding-agent events appear in these insights after the next successful scoring + narration run.</p>
  </section>;
}
