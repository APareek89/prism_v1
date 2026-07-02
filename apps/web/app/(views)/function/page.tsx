// app/(views)/function/page.tsx
//
// Function view — the faithful M1 port of the `#function` section of the approved
// design. Renders the per-section header (`.top` with the view title + PeriodToggle),
// the `.daterow` context pills, the `.hero` (IndexHero + SpectrumPanel), the trend +
// token-lens row, the improvements + drivers row, and the methodology footnote.
//
// Server Component. All numbers come from the data layer (lib/db), which returns
// safe empty/awaiting-signal shapes until index_daily has rows — so this renders
// cleanly empty with no fabricated values, and lights up when data exists.

import { getCurrentFunctionId } from '@/lib/db/_base';
import {
  getMeta,
  getIndex,
  getTrend,
  getTokenStats,
  getImprovements,
  getDrivers,
} from '@/lib/db/index-read';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { TokenLens } from '@/components/panels/TokenLens';
import { InsightList } from '@/components/panels/InsightList';
import { ChangeList } from '@/components/panels/ChangeList';
import { TrendChart } from '@/components/charts/TrendChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import { INK } from '@/app/tokens';
import { parsePeriod, WINDOW_DAYS } from '@/lib/config/constants';

export default async function FunctionView({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);

  const functionId = await getCurrentFunctionId();

  // No function resolved yet (keyless / no roster) → render the faithful chrome with an
  // awaiting-signal hero rather than fabricating a function.
  if (!functionId) {
    return (
      <div className="main">
        <div className="top">
          <div className="ttl">
            <h2>Function</h2>
            <p>Function-level AI-Native Index · developers</p>
          </div>
          <PeriodToggle />
        </div>
        <div className="card">
          <EmptyState
            title="Awaiting signal"
            hint="connect sources in Admin to populate the Function index"
          />
        </div>
      </div>
    );
  }

  const [meta, index, trend, tokenStats, improvements, drivers] = await Promise.all([
    getMeta('function', functionId, period),
    getIndex('function', functionId, period),
    getTrend('function', functionId, period),
    getTokenStats(period),
    getImprovements('function', functionId),
    getDrivers('function', functionId, period),
  ]);

  const confWidth = Math.max(0, Math.min(100, meta.confidencePct));

  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>{meta.scopeLabel}</h2>
          <p>Function-level AI-Native Index · developers</p>
        </div>
        <PeriodToggle />
      </div>

      <div className="daterow">
        <span className="pill">
          Period <b>{meta.periodLabel}</b>
        </span>
        <span className="pill">
          Window <b>{meta.windowLabel}</b>
        </span>
        <span className="pill">
          PRs in window <b>{meta.prsInWindow ?? '—'}</b>
        </span>
        <span className="conf">
          confidence
          <span className="bar">
            <i style={{ width: `${confWidth}%` }} />
          </span>
          {meta.confidence}
        </span>
      </div>

      <div className="hero">
        <IndexHero index={index} />
        <SpectrumPanel spectrum={index.spectrum} />
      </div>

      <div className="row r2">
        <div className="card">
          <div className="cardhead">
            <h3>AI-Native Index — trend</h3>
            <span className="sub">{trend.granularityLabel}</span>
          </div>
          {/* TrendChart renders its own awaiting-signal grid frame when the series is []. */}
          <TrendChart trend={trend} color={trend.hue ?? INK} />
        </div>
        <TokenLens stats={tokenStats} />
      </div>

      <div className="row r2">
        <div className="card">
          <div className="cardhead">
            <h3>Top 5 things to improve</h3>
            <span className="sub">ranked by index impact</span>
          </div>
          <InsightList
            items={improvements}
            limit={5}
            emptyHint="ranked improvements appear once the first scored window lands"
          />
        </div>
        <div className="card">
          <div className="cardhead">
            <h3>What moved the index</h3>
            <span className="sub">this period vs last</span>
          </div>
          <ChangeList drivers={drivers} />
        </div>
      </div>

      <div className="foot">
        L1 = weighted composite of the four L2 sub-indexes (Usage 10% · Efficiency 25% · Effectiveness
        40% · Proficiency 25%). Anchor-based scoring, within-cohort, recomputed daily on a trailing{' '}
        {WINDOW_DAYS}-day rolling window.
      </div>
    </div>
  );
}
