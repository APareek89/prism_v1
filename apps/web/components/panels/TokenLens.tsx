// components/panels/TokenLens.tsx
//
// The "Avg tokens / merged PR" cost-lens card — a faithful port of `.card.tok` from
// the approved design (Function view only). Big token figure + delta-vs-last-week +
// cost/PR + target line, over a BarTrend. When there is no series yet it renders an
// EmptyState instead of an empty chart. The bar chart itself is owned by the parallel
// charts agent (`@/components/charts/BarTrend`).

import { BarTrend } from '@/components/charts/BarTrend';
import { EmptyState } from '@/components/ui/EmptyState';
import { STATUS_COLORS } from '@/app/tokens';
import type { TokenStatsDTO } from '@/lib/ui/view-models';

export interface TokenLensProps {
  stats: TokenStatsDTO;
}

export function TokenLens({ stats }: TokenLensProps) {
  const hasData = stats.series.length > 0 && stats.tokensPerPrLabel !== null;

  return (
    <div className="card tok">
      <div className="cardhead">
        <h3>Avg tokens / merged PR</h3>
        <span className="sub">cost lens · function only</span>
      </div>

      {hasData ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 6 }}>
            <div className="bignum" style={{ margin: 0 }}>
              {stats.tokensPerPrLabel}
            </div>
            <div style={{ paddingBottom: 10 }}>
              {stats.deltaLabel ? <div className="delta up">{stats.deltaLabel}</div> : null}
              <div className="unit">
                {stats.costPerPrLabel}
                {stats.costPerPrLabel && stats.targetLabel ? ' · ' : ''}
                {stats.targetLabel}
              </div>
            </div>
          </div>
          {/* tokens/PR is a "lower is better" series → render in the good (green) hue.
              BarTrend wraps its own .chartwrap and renders an awaiting frame when []. */}
          <BarTrend data={stats.series} color={STATUS_COLORS.good} label="tokens per PR" />
        </>
      ) : (
        <EmptyState
          compact
          title="Awaiting signal"
          hint="tokens / PR appears once Claude Code sessions sync to merged PRs"
        />
      )}
    </div>
  );
}
