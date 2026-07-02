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
  const sumsOk = Math.abs(sums.main - 100) < 0.51 && Math.abs(sums.harness - 100) < 0.51;

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
              <span className="stchip st-dismiss">deleted</span>
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
              <button type="button" className="linkbtn" onClick={() => remove(k.kpi_id)}>delete</button>
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
    <span className="pill">
      {label} weights sum:{' '}
      <b style={{ color: Math.abs(sum - 100) < 0.51 ? 'var(--good)' : 'var(--bad)' }}>{sum.toFixed(1)}</b> / 100
    </span>
  );

  return (
    <>
      <div className="card">
        <div className="cardhead">
          <h3>MAIN index — Core-6</h3>
          <span className="sub">active: config v{activeVersion} ({activeNote}) · as-of {asOf ?? '—'}</span>
        </div>
        <table>{head}<tbody>{renderRows('main')}</tbody></table>
        <div className="daterow" style={{ marginTop: 12, marginBottom: 0 }}>{sumPill('main', sums.main)}</div>
      </div>

      <div className="card">
        <div className="cardhead">
          <h3>HARNESS index</h3>
          <span className="sub">separate · own confidence · no bands · never mixes into main</span>
        </div>
        <table>{head}<tbody>{renderRows('harness')}</tbody></table>
        <div className="daterow" style={{ marginTop: 12, marginBottom: 0 }}>{sumPill('harness', sums.harness)}</div>
      </div>

      <div className="card">
        <div className="cardhead">
          <h3>Diagnostics</h3>
          <span className="sub">scored + tier-badged · never weighted · KPI 9 promotes after one clean T1 month</span>
        </div>
        <table>{head}<tbody>{renderRows('diagnostic')}</tbody></table>
      </div>

      <div className="daterow">
        <button
          type="button"
          className="linkbtn"
          style={{ color: 'var(--ink)', borderColor: 'var(--usage)', padding: '9px 16px' }}
          disabled={!dirty || !sumsOk || saving}
          onClick={save}
        >
          {saving ? 'Saving + recomputing…' : `Save as config v${activeVersion + 1} & recompute`}
        </button>
        {!sumsOk ? <span className="stchip st-prog">each index must sum to 100 before saving</span> : null}
        {!dirty ? <span className="pill">no changes</span> : null}
        {error ? <span className="stchip st-prog">{error}</span> : null}
        {flash ? <span className="stchip st-adopted">{flash}</span> : null}
      </div>
    </>
  );
}
