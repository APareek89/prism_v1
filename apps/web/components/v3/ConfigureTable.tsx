'use client';

// Configure tab — the app's card/table treatment. The whole model rendered FROM
// the DB (v3.kpi_catalog + v3.data_points + the active v3.config_versions row).
//   · edit weights inline
//   · delete (disable) a KPI → proportional redistribution within its index
//     (engine's disableKpi — the same pure function the tests cover)
//   · Save → POST /api/v3/config → NEW config_versions row → engine recompute →
//     "recomputed with config vN" chip; dashboards read the new version.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DataPointRow, IndexConfig, KpiCatalogRow, KpiId } from '@prism/contract';
import { disableKpi, enableKpi } from '@prism/engine';

interface Props {
  catalog: KpiCatalogRow[];
  dataPoints: DataPointRow[];
  activeVersion: number;
  activeNote: string;
  initialConfig: IndexConfig;
  asOf: string | null;
}

const TAG_ICON: Record<string, string> = { now: '✅', setup: '🔧', est: '📐', no: '🚫' };

const DEFAULT_WEIGHTS: Record<string, number> = {
  ai_share: 7.5, cadence: 7.5, iterations: 17.5, tokens: 17.5, revert: 25, rework: 25,
  skills_authored: 25, verification: 25, review_loop: 25, continuity: 25,
};

const totalsOneHundred = (value: number) => Math.abs(value - 100) < 0.001;

export function ConfigureTable({ catalog, dataPoints, activeVersion, activeNote, initialConfig, asOf }: Props) {
  const [config, setConfig] = useState<IndexConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const pointsById = useMemo(() => new Map(dataPoints.map((p) => [p.id, p])), [dataPoints]);
  const sums = useMemo(() => {
    const sum = (index: 'main' | 'harness') =>
      catalog
        .filter((k) => k.index_kind === index && !config.disabled.includes(k.kpi_id))
        .reduce((a, k) => a + (config.weights[k.kpi_id] ?? 0), 0);
    return { main: sum('main'), harness: sum('harness') };
  }, [catalog, config]);

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(initialConfig), [config, initialConfig]);
  const sumsOk = totalsOneHundred(sums.main) && totalsOneHundred(sums.harness);

  const setWeight = (kpiId: KpiId, w: number) =>
    setConfig((c) => ({ ...c, weights: { ...c.weights, [kpiId]: w } }));
  const remove = (kpiId: KpiId) => setConfig((c) => disableKpi(catalog, c, kpiId));
  const restore = (kpiId: KpiId) =>
    setConfig((c) => enableKpi(catalog, c, kpiId, DEFAULT_WEIGHTS[kpiId] ?? 10));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v3/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config, note: 'Configure tab save' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const out = (await res.json()) as { version: number };
      setFlash(`✓ Saved & recomputed with config v${out.version}`);
      setTimeout(() => setFlash(null), 6000);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const renderRows = (index: 'main' | 'harness' | 'diagnostic') =>
    catalog.filter((k) => k.index_kind === index).map((k) => {
      const isDisabled = config.disabled.includes(k.kpi_id);
      const weight = config.weights[k.kpi_id];
      return (
        <tr key={k.kpi_id} style={isDisabled ? { opacity: 0.45 } : undefined}>
          <td className="mono muted2">{k.num}</td>
          <td>
            <span className="mem" style={{ alignItems: 'flex-start' }}>
              <span>
                <b>{k.name}</b>
                <small>{k.question}</small>
              </span>
            </span>
          </td>
          <td>
            <span className="chiplist" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <span className="chip">{k.index_kind}</span>
              <span className="chip">{k.dimension}</span>
            </span>
          </td>
          <td>
            <span className="muted2 mono" style={{ fontSize: 11, lineHeight: 1.6, display: 'block' }}>
              {k.data_point_ids.map((id) => {
                const p = pointsById.get(id);
                return <span key={id} style={{ display: 'block' }}>{TAG_ICON[p?.fetch_tag ?? 'now']} {p?.name ?? id}</span>;
              })}
            </span>
          </td>
          <td style={{ maxWidth: 320 }}>
            <span className="muted" style={{ fontSize: 12, lineHeight: 1.55 }}>{k.formula_text}</span>
          </td>
          <td>
            {index === 'diagnostic' ? (
              <span className="chip" style={{ color: 'var(--eff)' }}>tier-badged · unweighted</span>
            ) : isDisabled ? (
              <span className="stchip st-dismiss">disabled</span>
            ) : (
              <input
                type="number" min={0} max={100} step={0.5}
                value={weight ?? 0}
                onChange={(e) => setWeight(k.kpi_id, Number(e.target.value))}
                aria-label={`weight for ${k.name}`}
                className="mono"
                style={{
                  width: 66, background: 'var(--panel2)', color: 'var(--ink)',
                  border: '1px solid var(--line2)', borderRadius: 7, padding: '6px 8px', fontSize: 12.5,
                }}
              />
            )}
          </td>
          <td>
            {index === 'diagnostic' ? null : isDisabled ? (
              <button type="button" className="linkbtn" onClick={() => restore(k.kpi_id)}>restore</button>
            ) : (
              <button type="button" className="linkbtn" onClick={() => remove(k.kpi_id)}>disable</button>
            )}
          </td>
        </tr>
      );
    });

  const head = (
    <thead>
      <tr>
        <th>#</th><th>KPI</th><th>Index · dim</th><th>Input data points</th>
        <th>Calculation logic</th><th>Weight</th><th aria-label="actions" />
      </tr>
    </thead>
  );

  const sumPill = (label: string, sum: number) => (
    <span className="weight-total">
      {label} total: <b style={{ color: totalsOneHundred(sum) ? 'var(--good)' : 'var(--bad)' }}>{sum.toFixed(1)} / 100</b>
    </span>
  );

  return (
    <>
      <div className="model-intro">
        <div className="model-kind">
          <strong>MAIN index</strong>
          <p>Answers whether AI-assisted work is creating durable value. Usage 15%, Efficiency 35%, Outcomes 50%.</p>
          {sumPill('MAIN', sums.main)}
        </div>
        <div className="model-kind" style={{ background: '#faf6ff', borderColor: '#e3d8ef' }}>
          <strong>HARNESS index</strong>
          <p>Tracks whether compounding practices are installed. It has its own confidence and never enters MAIN.</p>
          {sumPill('HARNESS', sums.harness)}
        </div>
      </div>

      <div className="card config-section">
        <div className="cardhead">
          <div><span className="page-kicker">Outcome index</span><h3>MAIN · Core 6</h3></div>
          <span className="sub">Active v{activeVersion} · {activeNote} · as of {asOf ?? '—'}</span>
        </div>
        <div className="table-scroll"><table className="config-table">{head}<tbody>{renderRows('main')}</tbody></table></div>
      </div>

      <div className="card config-section">
        <div className="cardhead">
          <div><span className="page-kicker">Practice index</span><h3>HARNESS · Compounding practices</h3></div>
          <span className="sub">separate · own confidence · no bands · never mixes into main</span>
        </div>
        <div className="table-scroll"><table className="config-table">{head}<tbody>{renderRows('harness')}</tbody></table></div>
      </div>

      <div className="card config-section">
        <div className="cardhead">
          <div><span className="page-kicker">Trust and diagnosis</span><h3>Diagnostics</h3></div>
          <span className="sub">scored + tier-badged · never weighted · KPI 9 promotes after one clean T1 month</span>
        </div>
        <div className="table-scroll"><table className="config-table">{head}<tbody>{renderRows('diagnostic')}</tbody></table></div>
      </div>

      <div className="save-bar">
        <span className="muted" style={{ fontSize: 11 }}>
          {dirty ? 'Unsaved model changes' : `Config v${activeVersion} is active`}
        </span>
        {!sumsOk ? <span className="stchip st-prog">Both indexes must total 100</span> : null}
        {error ? <span className="stchip st-prog">{error}</span> : null}
        {flash ? <span className="stchip st-adopted">{flash}</span> : null}
        <button
          type="button"
          className="button primary"
          disabled={!dirty || !sumsOk || saving}
          onClick={save}
        >
          {saving ? 'Saving and recomputing…' : `Publish config v${activeVersion + 1}`}
        </button>
      </div>
    </>
  );
}
