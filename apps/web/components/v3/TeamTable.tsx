'use client';

// v3 squad roster — a faithful mirror of components/panels/RosterTable.tsx:
// .mem/.av member cell, .idxmini main index, dimension-hued .trendcell scores,
// .linkbtn drill-in. Enhancements kept quiet: sortable headers, band column,
// harness column (proficiency hue), suppressed scores render "—".

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Band } from '@prism/contract';
import { BAND_COLORS, DIMENSION_HUES } from '@/app/tokens';

export interface TeamTableRow {
  id: string;
  handle: string;
  name: string;
  archetype: string;
  team: string;
  mainScore: number | null;
  band: Band | null;
  mainConfidence: number;
  l0Forced: boolean;
  l5Capped: boolean;
  multiplier: number;
  dimensions: Partial<Record<'usage' | 'efficiency' | 'outcomes', number | null>>;
  harnessScore: number | null;
  harnessConfidence: number;
  aiSharePct: number | null;
  insightCount: number;
  recCount: number;
}

type SortKey = 'name' | 'mainScore' | 'harnessScore' | 'aiSharePct' | 'insightCount';

const COLS: Array<{ key: SortKey | null; label: string }> = [
  { key: 'name', label: 'Engineer' },
  { key: 'mainScore', label: 'Main index' },
  { key: null, label: 'Band' },
  { key: null, label: 'Usage' },
  { key: null, label: 'Efficiency' },
  { key: null, label: 'Outcomes' },
  { key: 'harnessScore', label: 'Harness' },
  { key: 'aiSharePct', label: 'AI share' },
  { key: 'insightCount', label: 'Insights' },
];

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(1));

export function TeamTable({ rows }: { rows: TeamTableRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'mainScore', dir: -1 });

  const sorted = useMemo(() => {
    const val = (r: TeamTableRow) => r[sort.key];
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;                       // nulls sink regardless of direction
      if (bv === null) return -1;
      if (typeof av === 'string') return sort.dir * av.localeCompare(bv as string);
      return sort.dir * ((av as number) - (bv as number));
    });
  }, [rows, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <table>
      <thead>
        <tr>
          {COLS.map((c) => (
            <th
              key={c.label}
              onClick={c.key ? () => toggle(c.key!) : undefined}
              style={c.key ? { cursor: 'pointer', userSelect: 'none' } : undefined}
              aria-sort={c.key === sort.key ? (sort.dir === -1 ? 'descending' : 'ascending') : undefined}
            >
              {c.label}
              {c.key === sort.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
            </th>
          ))}
          <th />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.id}>
            <td>
              <div className="mem">
                <span className="av">{r.name.charAt(0).toUpperCase()}</span>
                <div>
                  <b>{r.name}</b>
                  <small>@{r.handle} · {r.archetype.replaceAll('_', ' ')}</small>
                </div>
              </div>
            </td>
            <td>
              <span className="idxmini">{fmt(r.mainScore)}</span>
            </td>
            <td className="trendcell" style={{ color: r.band ? BAND_COLORS[r.band] : 'var(--mut2)' }}>
              {r.band ?? '—'}
              {r.l0Forced ? <small style={{ display: 'block', fontWeight: 500, color: 'var(--mut2)', fontSize: 10 }}>gated &lt;15%</small> : null}
              {r.l5Capped ? <small style={{ display: 'block', fontWeight: 500, color: 'var(--mut2)', fontSize: 10 }}>capped ×0</small> : null}
              {r.multiplier > 0 ? <small style={{ display: 'block', fontWeight: 500, color: 'var(--mut2)', fontSize: 10 }}>mult ×{r.multiplier}</small> : null}
            </td>
            <td className="trendcell" style={{ color: DIMENSION_HUES.usage }}>{fmt(r.dimensions.usage ?? null)}</td>
            <td className="trendcell" style={{ color: DIMENSION_HUES.efficiency }}>{fmt(r.dimensions.efficiency ?? null)}</td>
            <td className="trendcell" style={{ color: DIMENSION_HUES.effectiveness }}>{fmt(r.dimensions.outcomes ?? null)}</td>
            <td className="trendcell" style={{ color: DIMENSION_HUES.proficiency }}>
              {r.harnessScore === null ? '—' : fmt(r.harnessScore)}
            </td>
            <td className="trendcell" style={{ color: 'var(--mut)' }}>
              {r.aiSharePct === null ? '—' : `${r.aiSharePct.toFixed(0)}%`}
            </td>
            <td className="trendcell" style={{ color: 'var(--mut)' }}>{r.insightCount} · {r.recCount}</td>
            <td>
              <Link className="linkbtn" href={`/v3/dev/${r.handle}`} style={{ textDecoration: 'none', display: 'inline-block' }}>
                drill in
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
