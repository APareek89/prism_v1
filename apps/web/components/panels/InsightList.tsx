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
  detailed?: boolean;
}

export function InsightList({
  items,
  limit,
  emptyHint = 'improvements appear once the first scored window lands',
  detailed = false,
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
            {it.detail ? <details className="insight-depth" open={detailed}>
              <summary>{detailed ? 'Evidence-bound reasoning' : 'Inspect reasoning'}</summary>
              <dl>
                <div><dt>Observation</dt><dd>{it.detail.observation}</dd></div>
                <div><dt>Interpretation</dt><dd>{it.detail.interpretation}</dd></div>
                <div><dt>Alternative explanation</dt><dd>{it.detail.alternativeExplanation}</dd></div>
                <div><dt>Controllable action</dt><dd>{it.detail.action}</dd></div>
                <div><dt>Expected signal</dt><dd>{it.detail.expectedSignal}</dd></div>
                <div><dt>Verification</dt><dd>{it.detail.verificationPlan}</dd></div>
                <div><dt>Do-no-harm guard</dt><dd>{it.detail.doNoHarm}</dd></div>
                {it.detail.confidenceReason ? <div><dt>Confidence</dt><dd>{it.detail.confidenceReason}</dd></div> : null}
              </dl>
            </details> : null}
          </div>
          <span className={`tag2 ${it.tag}`}>{it.impactLabel}</span>
        </div>
      ))}
    </div>
  );
}
