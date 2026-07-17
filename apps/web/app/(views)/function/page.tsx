import { getCurrentFunctionId } from '@/lib/db/_base';
import {
  getMeta,
  getIndex,
  getTrend,
  getTokenStats,
  getImprovements,
  getDrivers,
} from '@/lib/db/index-read';
import { getRoster } from '@/lib/db/roster';
import { getConnectOverview } from '@/lib/connectors/telemetry/store';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { TokenLens } from '@/components/panels/TokenLens';
import { InsightList } from '@/components/panels/InsightList';
import { ChangeList } from '@/components/panels/ChangeList';
import { TrendChart } from '@/components/charts/TrendChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { INK } from '@/app/tokens';
import { parsePeriod, WINDOW_DAYS } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

export default async function FunctionView({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const functionId = await getCurrentFunctionId();

  if (!functionId) {
    return (
      <div className="page">
        <PageHeader
          kicker="Function impact"
          title="No real workspace is linked yet"
          description="Sign in with an invited team email, then connect GitHub and your coding agent. Prism never substitutes demo numbers."
          meta={<MetaChip label="Data" value="Awaiting real connection" tone="warning" />}
        />
        <div className="card"><EmptyState title="Awaiting signal" hint="connect real sources to populate the function index" /></div>
      </div>
    );
  }

  const [meta, index, trend, tokenStats, improvements, drivers, roster, live] = await Promise.all([
    getMeta('function', functionId, period),
    getIndex('function', functionId, period),
    getTrend('function', functionId, period),
    getTokenStats(period),
    getImprovements('function', functionId),
    getDrivers('function', functionId, period),
    getRoster(functionId),
    getConnectOverview(functionId),
  ]);

  return (
    <div className="page">
      <PageHeader
        kicker="Function impact"
        title="Is AI-assisted work creating durable value?"
        description="Real delivery evidence and opted-in coding-agent metadata only. Until the deterministic pipeline has enough signal, Prism leaves the index unpublished."
        actions={<PeriodToggle />}
        meta={
          <>
            <MetaChip label="People" value={roster.length} />
            <MetaChip label="GitHub evidence" value={`${live.github.prCount} PRs · ${live.github.commitCount} commits`} tone="accent" />
            <MetaChip label="AI sessions" value={live.sessionCounts.codex + live.sessionCounts.claudeCode} />
            <MetaChip label="Confidence" value={`${meta.confidence} · ${meta.confidencePct}%`} />
          </>
        }
      />

      <div className="hero">
        <IndexHero index={index} />
        <SpectrumPanel spectrum={index.spectrum} />
      </div>

      <div className="row r2">
        <div className="card">
          <div className="cardhead"><h3>AI-Native Index trend</h3><span className="sub">{trend.granularityLabel}</span></div>
          <TrendChart trend={trend} color={trend.hue ?? INK} />
        </div>
        <TokenLens stats={tokenStats} />
      </div>

      <div className="row r2">
        <div className="card">
          <div className="cardhead"><h3>Highest-leverage improvements</h3><span className="sub">ranked by deterministic index impact</span></div>
          <InsightList items={improvements} limit={5} emptyHint="improvements appear after the first real scored window" />
        </div>
        <div className="card">
          <div className="cardhead"><h3>What moved the index</h3><span className="sub">this period vs last</span></div>
          <ChangeList drivers={drivers} />
        </div>
      </div>

      <div className="foot">L1 remains the unchanged weighted composite of Usage 10%, Efficiency 25%, Effectiveness 40%, and Proficiency 25%, recomputed on a trailing {WINDOW_DAYS}-day window.</div>
    </div>
  );
}
