// components/panels/PrInsightList.tsx
//
// "Recent PR insights" (My view) — prompt quality · rework · AI-slop. Faithful port of
// the design's `.prlist` of `.pritem` rows: a `.prtag.(ok|warn|bad)` flag carrying the
// PR number, a `.prbody` with the title + an inline `.szbadge` (S/M/L) + the summary +
// an optional `.sug` coaching pointer, and a trailing dimension `.tag2` showing the
// flag label (clean · re-prompt · revert). EmptyState when there are no insights — the
// raw per-PR list is private to the employee and only exists once PRs are scored.
//
// Server Component (read-only).

import type { PrInsightDTO } from '@/lib/ui/view-models';
import { EmptyState } from '@/components/ui/EmptyState';

export interface PrInsightListProps {
  insights: PrInsightDTO[];
}

export function PrInsightList({ insights }: PrInsightListProps) {
  if (insights.length === 0) {
    return (
      <EmptyState
        compact
        hint="per-PR coaching appears once your merged PRs are scored — private to you"
      />
    );
  }

  return (
    <div className="prlist">
      {insights.map((pr, i) => (
        <div className="pritem" key={`${pr.prNumber}-${i}`}>
          <span className={`prtag ${pr.flagTone}`}>{pr.prNumber}</span>
          <div className="prbody">
            <b>
              {pr.title} <span className="szbadge">{pr.sizeBucket}</span>
            </b>
            <small>{pr.summary}</small>
            {pr.suggestion ? <span className="sug">{pr.suggestion}</span> : null}
          </div>
          <span className={`tag2 ${pr.tag}`}>{pr.tagLabel}</span>
        </div>
      ))}
    </div>
  );
}
