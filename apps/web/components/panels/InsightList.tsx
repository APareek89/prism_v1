// components/panels/InsightList.tsx
//
// The ranked-insight list — a faithful port of the `.ins` / `.insitem` block from the
// approved design. Used for the Function view's "Top 5 things to improve" and the
// Member detail's "What needs to improve". Each row is a rank `.n`, a `.tx` title +
// body, and a dimension-hued `.tag2` carrying the impact label. Renders an EmptyState
// when there are no improvements yet (no fabricated insights).

import { EmptyState } from '@/components/ui/EmptyState';
import type { ImprovementDTO } from '@/lib/ui/view-models';

export interface InsightListProps {
  items: ImprovementDTO[];
  /** Optional cap (Function = top 5). */
  limit?: number;
  /** Hint shown when there's nothing to improve yet. */
  emptyHint?: string;
}

export function InsightList({
  items,
  limit,
  emptyHint = 'improvements appear once the first scored window lands',
}: InsightListProps) {
  if (items.length === 0) {
    return <EmptyState compact title="Awaiting signal" hint={emptyHint} />;
  }

  const shown = typeof limit === 'number' ? items.slice(0, limit) : items;

  return (
    <div className="ins">
      {shown.map((it) => (
        <div className="insitem" key={it.rank}>
          <span className="n">{String(it.rank).padStart(2, '0')}</span>
          <div className="tx">
            <b>{it.title}</b>
            <small>{it.body}</small>
          </div>
          <span className={`tag2 ${it.tag}`}>{it.impactLabel}</span>
        </div>
      ))}
    </div>
  );
}
