import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activePin, developerByHandle, developerDetail } from '@/lib/v3/read';
import { InsightList, KpiTable, RecList, V3IndexHero, V3Spectrum } from '@/components/v3/detail';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';

export default async function MemberDetailPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const dev = await developerByHandle(memberId);
  if (!dev) notFound();
  const pin = await activePin();
  const detail = await developerDetail(dev.id, pin);
  if (!detail) notFound();

  const mainKpis = detail.kpis.filter((k) => k.index_kind === 'main');
  const otherKpis = detail.kpis.filter((k) => k.index_kind !== 'main');
  const confidenceValue = detail.main?.confidence ?? 0;
  const confidence = confidenceValue >= .75 ? 'High' : confidenceValue >= .55 ? 'Medium' : confidenceValue >= .4 ? 'Low' : 'Insufficient';
  const priority = detail.recommendations[0] ?? null;

  return (
    <div className="page">
      <PageHeader
        kicker="People · individual coaching"
        title={detail.dev.name}
        description={`@${detail.dev.handle} · ${detail.dev.archetype.replaceAll('_', ' ')} · ${detail.dev.team}`}
        actions={<Link href="/team" className="button ghost"><Icon name="arrow-left" size={15} /> Back to people</Link>}
        meta={
          <>
            <MetaChip label="Window" value="Trailing 28 days" />
            <MetaChip label="Confidence" value={`${confidence} · ${(confidenceValue * 100).toFixed(0)}%`} />
            <MetaChip label="Seat" value={detail.dev.seat_tier} />
            <MetaChip label="Config" value={`v${pin.version}`} />
          </>
        }
      />

      <section className="profile-hero" aria-label={`${detail.dev.name} impact summary`}>
        <V3IndexHero main={detail.main} />
        <aside className="priority-card" style={{ minHeight: 250 }}>
          <span className="priority-icon"><Icon name="target" size={20} /></span>
          <span className="kicker">Best next move</span>
          <h2>{priority?.title ?? 'Build more trusted signal'}</h2>
          <p>{priority?.rationale ?? 'There is not enough evidence for a responsible behavior recommendation yet.'}</p>
          {priority ? <div className="priority-meta"><span className="micro-badge">Impact {priority.impact.toFixed(1)}</span><span className="micro-badge">Owner: {priority.owner}</span></div> : null}
        </aside>
      </section>

      <section className="section evidence-grid">
        <V3Spectrum values={{
          usage: detail.main?.dimensions?.usage ?? null,
          efficiency: detail.main?.dimensions?.efficiency ?? null,
          outcomes: detail.main?.dimensions?.outcomes ?? null,
          harness: detail.harness?.score ?? null,
        }} />
        <div className="card">
          <div className="cardhead"><div><span className="page-kicker">Interpretation</span><h3>How to use this profile</h3></div><Icon name="shield" size={18} /></div>
          <div className="signal-list">
            <div className="signal-item"><span className="signal-mark">1</span><span className="signal-body"><b>Start with the lowest MAIN dimension</b><p>It identifies where AI-assisted delivery is currently constrained.</p></span></div>
            <div className="signal-item"><span className="signal-mark">2</span><span className="signal-body"><b>Use HARNESS as a cause to test</b><p>It is a separate practice index, not a hidden penalty in the MAIN score.</p></span></div>
            <div className="signal-item"><span className="signal-mark">3</span><span className="signal-body"><b>Act only on confirmed evidence</b><p>Low-confidence or unlinked signals should trigger better measurement first.</p></span></div>
          </div>
        </div>
      </section>

      <section className="section evidence-grid">
        <InsightList insights={detail.insights} title="What the evidence says" sub="Confirmed hypotheses only · data quality first" />
        <RecList recs={detail.recommendations} title="Coaching actions" />
      </section>

      <section className="section">
        <details className="detail-disclosure">
          <summary><span>Audit the underlying KPI evidence</span><span className="muted2" style={{ fontSize: 10, fontWeight: 400 }}>Raw values, normalized scores, and signal counts</span></summary>
          <div className="detail-body row r2">
            <KpiTable kpis={mainKpis} title="MAIN · Core 6" sub="Raw signal → deterministic anchors → score" />
            <KpiTable kpis={otherKpis} title="HARNESS + diagnostics" sub="Separate index and unweighted trust signals" />
          </div>
        </details>
      </section>

      <div className="foot">Every AI→PR join stores its method and confidence. Who caught an issue changes the action—not the score.</div>
    </div>
  );
}
