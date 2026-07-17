import { activeConfigVersion, activePin, dataPoints, kpiCatalog } from '@/lib/v3/read';
import { ConfigureTable } from '@/components/v3/ConfigureTable';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';

export default async function ConfigurePage() {
  const [catalog, points, active, pin] = await Promise.all([kpiCatalog(), dataPoints(), activeConfigVersion(), activePin()]);
  return (
    <div className="page">
      <PageHeader
        kicker="System · advanced"
        title="Make the index match your operating model"
        description="Inspect every input and adjust weights without rewriting history. Saving creates a new version, then recomputes every view together."
        actions={<span className="button ghost" aria-label="Deterministic scoring boundary"><Icon name="shield" size={16} /> Deterministic boundary</span>}
        meta={
          <>
            <MetaChip label="Active config" value={`v${active.version}`} tone="accent" />
            <MetaChip label="Last compute" value={pin.date ?? 'Not computed'} />
            <MetaChip label="Policy" value="Append-only versions" />
          </>
        }
      />

      <div className="note" style={{ marginBottom: 18 }}>
        <h4>Changing weights changes every published dashboard</h4>
        <p>Review totals before saving. MAIN and HARNESS each stay at 100%; the two indexes remain separate and are never blended.</p>
      </div>

      <ConfigureTable
        catalog={catalog}
        dataPoints={points}
        activeVersion={active.version}
        activeNote={active.note}
        initialConfig={active.config}
        asOf={pin.date}
      />

      <div className="foot">Every version is auditable. Disabling a KPI redistributes its weight only within the same index; prior configurations remain intact.</div>
    </div>
  );
}
