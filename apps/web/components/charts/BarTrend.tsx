// components/charts/BarTrend.tsx
//
// Inline-SVG bar trend — NO chart library. Faithful port of the reference
// `barChart`: rounded bars (rx 2), 62% slot width, the FINAL bar highlighted at
// full opacity while earlier bars render at ~40% (`color + '66'`). Pure
// presentational: takes a raw number[] (e.g. TokenStatsDTO.series) and renders
// deterministic geometry from lib/charts/scale — never fabricates bars.
//
// Empty series ⇒ an "awaiting signal" frame: grid lines only, no bars.
// Reuses the `.chartwrap` / `.axis` classes already in app/globals.css.

import type { ChartBox } from '@/lib/charts/scale';
import { DEFAULT_BOX, barGeometry, gridLines } from '@/lib/charts/scale';

export interface BarTrendProps {
  /** The bar series (e.g. TokenStatsDTO.series). [] ⇒ awaiting-signal frame. */
  data: readonly number[];
  /** Bar color; the last bar is solid, earlier bars are this + 40% alpha. */
  color?: string;
  /** Optional drawing box override (defaults to 520×150). */
  box?: ChartBox;
  /** Accessible label. */
  label?: string;
}

const GRID_STROKE = '#222a3d';
const DEFAULT_HUE = '#3ecf8e';
/** Hex alpha suffix (~40%) for non-final bars — matches the reference `+ '66'`. */
const FADE = '66';

export function BarTrend({ data, color = DEFAULT_HUE, box = DEFAULT_BOX, label }: BarTrendProps) {
  const { w, h, pad } = box;
  const empty = data.length === 0;
  const bars = empty ? [] : barGeometry(data, box);
  const grid = gridLines(box);
  const ariaLabel = label ?? 'bar trend';

  return (
    <div className="chartwrap">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ height: h }}
        role="img"
        aria-label={empty ? `${ariaLabel} — awaiting signal` : ariaLabel}
      >
        {/* Empty state shows the same grid frame as TrendChart so the panels match. */}
        {empty &&
          grid.map((y, i) => (
            <line
              key={i}
              x1={pad}
              y1={y}
              x2={w - pad}
              y2={y}
              stroke={GRID_STROKE}
              strokeWidth={1}
            />
          ))}

        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x.toFixed(1)}
            y={b.y.toFixed(1)}
            width={b.width.toFixed(1)}
            height={b.height.toFixed(1)}
            rx={2}
            fill={b.last ? color : color + FADE}
          />
        ))}
      </svg>
    </div>
  );
}

export default BarTrend;
