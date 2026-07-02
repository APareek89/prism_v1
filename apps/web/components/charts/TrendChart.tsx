// components/charts/TrendChart.tsx
//
// Inline-SVG area+line trend chart — NO chart library. Faithful port of the
// reference `areaChart` look: a soft top-down gradient fill, a 2.2px line, and an
// end-of-series dot. Pure presentational: it takes a TrendDTO (or a raw number[])
// and renders deterministic geometry from lib/charts/scale — never fabricates data.
//
// Empty series ⇒ an "awaiting signal" frame: grid lines only, no line/area/dot.
// Reuses the `.chartwrap` / `.axis` classes already in app/globals.css.

import { useId } from 'react';
import type { TrendDTO } from '@/lib/ui/view-models';
import {
  DEFAULT_BOX,
  areaGeometry,
  gridLines,
  type ChartBox,
} from '@/lib/charts/scale';

export interface TrendChartProps {
  /** A TrendDTO from the data layer, or a raw series. */
  trend?: TrendDTO;
  data?: readonly number[];
  /** Line/fill color; falls back to trend.hue, then ink. */
  color?: string;
  /** Optional drawing box override (defaults to 520×150). */
  box?: ChartBox;
  /** Accessible label; defaults to the granularity label. */
  label?: string;
}

const GRID_STROKE = '#222a3d';
const DOT_RING = '#0d111c';
const DEFAULT_HUE = '#eef1f7';

export function TrendChart({ trend, data, color, box = DEFAULT_BOX, label }: TrendChartProps) {
  const reactId = useId();
  const gradId = `trendgrad-${reactId.replace(/[:]/g, '')}`;
  const series = data ?? trend?.series ?? [];
  const hue = color ?? trend?.hue ?? DEFAULT_HUE;
  const { w, h, pad } = box;
  const ariaLabel = label ?? trend?.granularityLabel ?? 'trend';

  const grid = gridLines(box);
  const empty = series.length === 0;
  const geo = empty ? null : areaGeometry(series, box);

  return (
    <div className="chartwrap">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ height: h }}
        role="img"
        aria-label={empty ? `${ariaLabel} — awaiting signal` : ariaLabel}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={hue} stopOpacity="0.28" />
            <stop offset="1" stopColor={hue} stopOpacity="0" />
          </linearGradient>
        </defs>

        {grid.map((y, i) => (
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

        {geo && (
          <>
            <path d={geo.area} fill={`url(#${gradId})`} />
            <path
              d={geo.line}
              fill="none"
              stroke={hue}
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {geo.end && (
              <circle
                cx={geo.end.x}
                cy={geo.end.y}
                r={3.5}
                fill={hue}
                stroke={DOT_RING}
                strokeWidth={2}
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}

export default TrendChart;
