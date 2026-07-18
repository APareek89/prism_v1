import { InsightList } from '@/components/panels/InsightList';
import type { ImprovementDTO } from '@/lib/ui/view-models';

export function PerformanceInsights({ strengths, improvements, organization = false }: { strengths: ImprovementDTO[]; improvements: ImprovementDTO[]; organization?: boolean }) {
  return <section className="performance-insights">
    <div className="section-heading">
      <div><span className="page-kicker">Evidence-grounded insights</span><h2>What is working—and what deserves attention</h2><p>{organization ? 'Up to six major organization signals, generated only from privacy-safe aggregate KPI evidence. No employee narrative is rolled up.' : 'Detailed private coaching separates observation, interpretation, alternatives, action, and verification. It never computes or changes your score.'}</p></div>
      <span className="count-badge">latest completed pipeline run</span>
    </div>
    <div className="personal-signal-grid">
      <article className="card"><div className="cardhead"><h3>Going well</h3><span className="sub">measured strengths worth protecting</span></div><InsightList items={strengths} detailed={!organization} emptyHint="a win appears when a KPI reaches its configured target" /></article>
      <article className="card"><div className="cardhead"><h3>Needs improvement</h3><span className="sub">ranked by deterministic priority gap</span></div><InsightList items={improvements} detailed={!organization} emptyHint="an improvement appears after the first real scored window" /></article>
    </div>
    <p className="insight-schedule-note">The durable pipeline runs daily at 06:00 UTC (11:30 IST) and can also be run on demand. New GitHub or coding-agent events appear in these insights after the next successful scoring + narration run.</p>
  </section>;
}
