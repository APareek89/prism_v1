'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Band } from '@prism/contract';
import { BAND_COLORS, DIMENSION_HUES } from '@/app/tokens';
import { Icon } from '@/components/ui/Icon';

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

type Filter = 'all' | 'attention' | 'practice-gap' | 'low-signal';
type Sort = 'name' | 'main-high' | 'main-low' | 'actions';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'attention', label: 'Has actions' },
  { value: 'practice-gap', label: 'Practice gap' },
  { value: 'low-signal', label: 'Low signal' },
];

const BAND_NAMES: Record<string, string> = { L0: 'Dormant', L1: 'Basic', L2: 'Productive', L3: 'Workflow', L4: 'Power', L5: 'Multiplier' };

function weakestDimension(row: TeamTableRow) {
  const dims = [
    { label: 'Usage', value: row.dimensions.usage, color: DIMENSION_HUES.usage },
    { label: 'Efficiency', value: row.dimensions.efficiency, color: DIMENSION_HUES.efficiency },
    { label: 'Outcomes', value: row.dimensions.outcomes, color: DIMENSION_HUES.effectiveness },
  ].filter((d): d is { label: string; value: number; color: string } => d.value !== null && d.value !== undefined);
  return dims.sort((a, b) => a.value - b.value)[0] ?? null;
}

function confidenceLabel(value: number) {
  return value >= .75 ? 'High confidence' : value >= .55 ? 'Medium confidence' : value >= .4 ? 'Low confidence' : 'Insufficient signal';
}

export function TeamTable({ rows }: { rows: TeamTableRow[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesQuery = !q || `${row.name} ${row.handle} ${row.archetype}`.toLowerCase().includes(q);
      if (!matchesQuery) return false;
      if (filter === 'attention') return row.recCount > 0;
      if (filter === 'practice-gap') return (row.mainScore ?? -1) >= 55 && (row.harnessScore ?? 101) < 50;
      if (filter === 'low-signal') return row.mainConfidence < .4;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === 'main-high') return (b.mainScore ?? -1) - (a.mainScore ?? -1);
      if (sort === 'main-low') return (a.mainScore ?? 101) - (b.mainScore ?? 101);
      if (sort === 'actions') return b.recCount - a.recCount || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [filter, query, rows, sort]);

  return (
    <>
      <div className="team-toolbar">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" aria-label="Search people" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Filter people">
            {FILTERS.map((item) => <button key={item.value} className={filter === item.value ? 'on' : ''} onClick={() => setFilter(item.value)}>{item.label}</button>)}
          </div>
          <select className="select" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort people">
            <option value="name">Sort: Name</option>
            <option value="actions">Sort: Open actions</option>
            <option value="main-high">Sort: MAIN high</option>
            <option value="main-low">Sort: MAIN low</option>
          </select>
        </div>
      </div>

      <div className="team-table-wrap">
        <table className="team-table">
          <thead><tr><th>Person</th><th>Main impact</th><th>Practice index</th><th>Current constraint</th><th>Evidence</th><th><span className="sr-only">Open profile</span></th></tr></thead>
          <tbody>
            {shown.map((row) => {
              const weak = weakestDimension(row);
              const bandColor = row.band ? BAND_COLORS[row.band] : 'var(--mut2)';
              return (
                <tr key={row.id}>
                  <td>
                    <div className="mem"><span className="av">{row.name.charAt(0).toUpperCase()}</span><span><b>{row.name}</b><small>@{row.handle} · {row.archetype.replaceAll('_', ' ')}</small></span></div>
                  </td>
                  <td>
                    <div className="score-cell"><strong>{row.mainScore === null ? '—' : row.mainScore.toFixed(1)}</strong><span>/100</span></div>
                    <span className="status-label" style={{ color: bandColor }}><i style={{ background: bandColor }} />{row.band ? BAND_NAMES[row.band] : 'Not published'}</span>
                  </td>
                  <td>
                    <div className="score-cell"><strong style={{ color: DIMENSION_HUES.proficiency }}>{row.harnessScore === null ? '—' : row.harnessScore.toFixed(1)}</strong><span>/100</span></div>
                    <span className="muted2" style={{ fontSize: 9.5 }}>Separate from MAIN</span>
                  </td>
                  <td>
                    {weak ? <><span className="status-label" style={{ color: weak.color }}><i style={{ background: weak.color }} />{weak.label}</span><div className="muted2 mono" style={{ fontSize: 9, marginTop: 3 }}>{weak.value.toFixed(1)} / 100</div></> : <span className="muted2">Awaiting signal</span>}
                  </td>
                  <td><span className="micro-badge">{row.insightCount} insights</span> <span className="micro-badge">{row.recCount} actions</span><div className="muted2" style={{ fontSize: 9.5, marginTop: 4 }}>{confidenceLabel(row.mainConfidence)}</div></td>
                  <td><Link className="button ghost" href={`/team/${row.handle}`}>Open <Icon name="arrow-right" size={14} /></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length ? <div className="empty-filter">No people match this view.</div> : null}
      </div>
    </>
  );
}
