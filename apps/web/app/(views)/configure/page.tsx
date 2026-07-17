import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { getAuthUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { getIndexConfig, getSizingRule } from '@/lib/db/admin';
import { DIMENSION_HUES } from '@/app/tokens';

export const dynamic = 'force-dynamic';

export default async function ConfigurePage() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return (
      <div className="page">
        <PageHeader kicker="Index model" title="Administrator access required" description="Only a workspace administrator can inspect production scoring configuration." />
      </div>
    );
  }

  const [config, sizing] = await Promise.all([
    getIndexConfig(user.functionId),
    getSizingRule(user.functionId),
  ]);
  const total = config.reduce((sum, row) => sum + row.weightPct, 0);

  return (
    <div className="page">
      <PageHeader
        kicker="Production model · read only"
        title="The calculation stays deterministic"
        description="This page reads the active public index configuration. No preview schema or synthetic developer data is involved."
        meta={
          <>
            <MetaChip label="Weight total" value={`${total}%`} tone="accent" />
            <MetaChip label="Sizing" value={sizing.frozen ? 'Calibrated' : 'Cold-start'} />
            <MetaChip label="Data" value="Production config" />
          </>
        }
      />

      <div className="model-intro">
        <div className="model-kind"><strong>Evidence in, score out</strong><p>Every number is produced by the existing scoring library. AI agents can explain results but cannot compute or change them.</p></div>
        <div className="model-kind"><strong>Insufficient stays insufficient</strong><p>Missing signal produces an empty state, never a fabricated zero and never a demo substitute.</p></div>
      </div>

      <div className="card config-section">
        <div className="cardhead"><div><span className="page-kicker">Active public configuration</span><h3>Dimension weights and anchors</h3></div><span className="sub">unchanged calculation logic</span></div>
        <div className="config-real-grid">
          {config.map((row) => (
            <article key={row.dimension}>
              <span className="dimension-dot" style={{ background: DIMENSION_HUES[row.dimension] }} />
              <div><strong>{row.label}</strong><p>{row.anchorLabel}</p></div>
              <b>{row.weightPct}%</b>
            </article>
          ))}
        </div>
      </div>

      <div className="card config-section">
        <div className="cardhead"><div><span className="page-kicker">Change sizing</span><h3>{sizing.formula}</h3></div><span className="sub">{sizing.frozen ? 'frozen calibration' : 'cold-start thresholds'}</span></div>
        <div className="chiplist">{sizing.thresholds.map((threshold) => <span className="meta-chip" key={threshold}>{threshold}</span>)}</div>
      </div>

      <div className="foot">Changing the production model remains an explicit versioned operation. This real-user launch does not alter any scoring formula.</div>
    </div>
  );
}
