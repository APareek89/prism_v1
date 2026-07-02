// components/panels/IndexHero.tsx
//
// The big-L1 hero — a faithful port of `.card.idxcard` from the approved design.
// Eyebrow → `.bignum` (L1 + "/100") → band delta → band blurb line. When the index
// is suppressed (confidence < 0.40) we render an EmptyState INSTEAD of a fabricated
// number — never invent an L1. Shared by Function, Member detail and My view; props
// are fixed by the M1 contract and must not change.

import { EmptyState } from '@/components/ui/EmptyState';
import type { IndexDTO } from '@/lib/ui/view-models';

export interface IndexHeroProps {
  index: IndexDTO;
  /** Member detail / My view label the eyebrow differently (vs the function-level). */
  vsSquad?: boolean;
}

/** Map a DeltaDir to the design's `.delta` modifier class (up/dn/flat). */
function deltaClass(dir: 'up' | 'down' | 'flat'): string {
  return dir === 'up' ? 'up' : dir === 'down' ? 'dn' : 'flat';
}

export function IndexHero({ index, vsSquad = false }: IndexHeroProps) {
  const eyebrow = vsSquad ? 'AI-Native Index · this member' : 'AI-Native Index · L1';

  // Suppressed (or no L1 at all) ⇒ awaiting signal. No fabricated headline number.
  if (index.suppressed || index.l1 === null) {
    return (
      <div className="card idxcard">
        <div className="eyebrow">{eyebrow}</div>
        <EmptyState
          title="Awaiting signal"
          hint="confidence is below the publish threshold — the index appears once enough signal accrues"
        />
      </div>
    );
  }

  const delta = index.delta;

  return (
    <div className="card idxcard">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <div className="bignum">
          {index.l1}
          <span>/100</span>
        </div>
        {delta ? (
          <div className={`delta ${deltaClass(delta.dir)}`}>{delta.label}</div>
        ) : null}
      </div>
      {index.band ? (
        <div className="lvl">
          Band <b>{index.band}</b>
          {index.bandBlurb ? <> — {index.bandBlurb}</> : null}
        </div>
      ) : null}
    </div>
  );
}
