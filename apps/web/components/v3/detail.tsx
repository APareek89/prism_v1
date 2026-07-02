// v3 detail blocks — structural mirrors of the v1 panels:
//   IndexHero  → components/panels/IndexHero.tsx   (.card.idxcard, .bignum, .lvl)
//   Spectrum   → components/panels/SpectrumPanel.tsx (.subrow/.track/.subval, weight smalls)
//   Insights   → the v1 .ins/.insitem list with .tag2 channel chips
//   Recs       → the v1 .prlist/.pritem treatment
// KPI breakdown renders as a plain v1 table (th/td from globals.css).

import type { IndexDailyRow, InsightRow, KpiDailyRow, RecommendationRow } from '@prism/contract';
import { BAND_COLORS, DIMENSION_HUES } from '@/app/tokens';
import { EmptyState } from '@/components/ui/EmptyState';

const BAND_BLURBS: Record<string, string> = {
  L0: 'Dormant — AI touches almost nothing that ships.',
  L1: 'Basic — early, ad-hoc AI use; the habit is forming.',
  L2: 'Productive — AI is part of the weekly workflow.',
  L3: 'Workflow — AI-first habits with reliable outcomes.',
  L4: 'Power — high leverage, strong outcomes, harness in place.',
  L5: 'Multiplier — others ship faster because of your assets.',
};

const CHANNEL_TAG2: Record<string, string> = {
  fix: 'cost', nudge: 'eff', rec: 'usage', team: 'effness', org: 'prof',
};
const CHANNEL_LABEL: Record<string, string> = {
  fix: 'fix data first', nudge: 'in-flow nudge', rec: 'recommendation', team: 'team/process', org: 'platform/admin',
};

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Number(n).toFixed(1));

/** The big main-index card — IndexHero's exact treatment, v3 band names. */
export function V3IndexHero({ main }: { main: IndexDailyRow | null }) {
  if (!main || main.score === null) {
    return (
      <div className="card idxcard">
        <div className="eyebrow">Main index · v3.0</div>
        <EmptyState
          title="Awaiting signal"
          hint="confidence is below the publish threshold — the index appears once enough signal accrues"
        />
      </div>
    );
  }
  return (
    <div className="card idxcard">
      <div>
        <div className="eyebrow">Main index · v3.0 · usage 15 / efficiency 35 / outcomes 50</div>
        <div className="bignum">
          {main.score.toFixed(1)}
          <span>/100</span>
        </div>
        {main.gates.l0_forced ? <div className="delta dn">L0 gate — AI share &lt; 15%</div> : null}
        {main.gates.l5_capped ? <div className="delta flat">L5 capped — no multiplier signal</div> : null}
        {main.gates.multiplier_signal > 0 ? (
          <div className="delta up">multiplier ×{main.gates.multiplier_signal} · AI Leader</div>
        ) : null}
      </div>
      {main.band ? (
        <div className="lvl">
          Band <b style={{ color: BAND_COLORS[main.band] }}>{main.band}</b>
          {' — '}{BAND_BLURBS[main.band]}
        </div>
      ) : null}
    </div>
  );
}

/** Dimension spectrum + the separate harness row — SpectrumPanel's exact treatment. */
export function V3Spectrum({ main, harness }: { main: IndexDailyRow | null; harness: IndexDailyRow | null }) {
  const dims = [
    { key: 'usage' as const, label: 'Usage', hue: DIMENSION_HUES.usage, weight: 15 },
    { key: 'efficiency' as const, label: 'Efficiency', hue: DIMENSION_HUES.efficiency, weight: 35 },
    { key: 'outcomes' as const, label: 'Outcomes', hue: DIMENSION_HUES.effectiveness, weight: 50 },
  ];
  return (
    <div className="card spectrum">
      {dims.map((d) => {
        const score = main?.dimensions?.[d.key] ?? null;
        const width = score === null ? 0 : Math.max(0, Math.min(100, score));
        return (
          <div className="subrow" key={d.key}>
            <div className="lab">
              <i style={{ background: d.hue }} />
              <div>
                {d.label}
                <small>weight {d.weight}%</small>
              </div>
            </div>
            <div className="track">
              <i style={{ width: `${width}%`, background: d.hue }} />
            </div>
            <div className="subval"><b>{fmt(score)}</b></div>
          </div>
        );
      })}
      <div className="subrow" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <div className="lab">
          <i style={{ background: DIMENSION_HUES.proficiency }} />
          <div>
            Harness
            <small>separate index · no bands</small>
          </div>
        </div>
        <div className="track">
          <i style={{ width: `${Math.max(0, Math.min(100, harness?.score ?? 0))}%`, background: DIMENSION_HUES.proficiency }} />
        </div>
        <div className="subval"><b>{harness?.score === null || !harness ? '—' : harness.score.toFixed(1)}</b></div>
      </div>
    </div>
  );
}

/** KPI breakdown — a plain v1 table. */
export function KpiTable({ kpis, title, sub }: { kpis: KpiDailyRow[]; title: string; sub?: string }) {
  return (
    <div className="card">
      <div className="cardhead">
        <h3>{title}</h3>
        {sub ? <span className="sub">{sub}</span> : null}
      </div>
      <table>
        <thead>
          <tr><th>KPI</th><th>Raw</th><th>Score</th><th>Signals</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {kpis.map((k) => (
            <tr key={k.kpi_id}>
              <td><b style={{ fontSize: 13 }}>{k.kpi_id.replaceAll('_', ' ')}</b></td>
              <td className="trendcell" style={{ color: 'var(--mut)' }}>
                {k.raw_value === null ? 'no signal' : k.raw_value}
              </td>
              <td><span className="idxmini">{k.score === null ? '—' : Math.round(k.score)}</span></td>
              <td className="trendcell" style={{ color: 'var(--mut2)' }}>n={k.signal_count}</td>
              <td>
                <div className="chiplist">
                  {k.index_kind === 'diagnostic' ? <span className="chip">diagnostic</span> : null}
                  {k.tier ? <span className="chip" style={{ color: 'var(--eff)' }}>tier {k.tier}</span> : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmed-hypothesis insights — the v1 .ins/.insitem/.tag2 treatment. */
export function InsightList({ insights, title, sub }: { insights: InsightRow[]; title: string; sub?: string }) {
  return (
    <div className="card">
      <div className="cardhead">
        <h3>{title}</h3>
        {sub ? <span className="sub">{sub}</span> : null}
      </div>
      {insights.length === 0 ? (
        <EmptyState compact title="No confirmed insights" hint="nothing below target with a surviving hypothesis" />
      ) : (
        <div className="ins">
          {insights.map((i) => (
            <div className="insitem" key={i.id}>
              <span className="n">{i.hypothesis}</span>
              <div className="tx">
                <b>{i.title}</b>
                <small>{i.body}</small>
              </div>
              <span className={`tag2 ${CHANNEL_TAG2[i.channel] ?? 'usage'}`}>
                {i.kpi_id === 'linkage' ? '🔗 ' : ''}{CHANNEL_LABEL[i.channel] ?? i.channel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ranked recommendations — the v1 .prlist/.pritem treatment. */
export function RecList({ recs, title }: { recs: RecommendationRow[]; title: string }) {
  return (
    <div className="card">
      <div className="cardhead">
        <h3>{title}</h3>
        <span className="sub">impact = (100 − score) × index weight · monitored for adoption</span>
      </div>
      {recs.length === 0 ? (
        <EmptyState compact title="No open recommendations" hint="every targeted KPI is at or near target" />
      ) : (
        <div className="prlist">
          {recs.map((r) => (
            <div className="pritem" key={r.id}>
              <span className={`prtag ${r.impact >= 40 ? 'bad' : r.impact >= 20 ? 'warn' : 'ok'}`}>
                #{r.rank}
              </span>
              <div className="prbody">
                <b>{r.title}</b>
                <small>{r.rationale}</small>
                <div className="sug">
                  impact {r.impact.toFixed(1)} · owner {r.owner} · {CHANNEL_LABEL[r.channel] ?? r.channel} · targets {r.targets.join(', ')}
                </div>
              </div>
              <span className="szbadge">{r.channel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
