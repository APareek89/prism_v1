// /v3/configure — the model rendered FROM the DB (v3 preview). v1 page skeleton:
// .top header → .daterow pills → the config cards (tables) → .foot.

import { activeConfigVersion, activePin, dataPoints, kpiCatalog } from '@/lib/v3/read';
import { ConfigureTable } from '@/components/v3/ConfigureTable';

export const dynamic = 'force-dynamic';

export default async function V3ConfigurePage() {
  const [catalog, points, active, pin] = await Promise.all([
    kpiCatalog(), dataPoints(), activeConfigVersion(), activePin(),
  ]);
  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>Configure</h2>
          <p>The whole model from the database — v3.kpi_catalog ⋈ v3.data_points · v3.0 preview</p>
        </div>
      </div>

      <div className="daterow">
        <span className="pill">Active <b>config v{active.version}</b></span>
        <span className="pill">As-of <b>{pin.date ?? '—'}</b></span>
        <span className="pill" style={{ color: 'var(--warn)' }}>Data <b>demo</b></span>
      </div>

      <ConfigureTable
        catalog={catalog}
        dataPoints={points}
        activeVersion={active.version}
        activeNote={active.note}
        initialConfig={active.config}
        asOf={pin.date}
      />

      <div className="foot">
        Deleting a KPI redistributes its weight proportionally across the remaining enabled KPIs of
        the SAME index (main and harness each always sum to 100). Every save appends a new
        config version — nothing is ever mutated — and recomputes every dashboard from it.
      </div>
    </div>
  );
}
