import { getAuthUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/roles';
import {
  getMeta,
  getIndex,
  getTrend,
  getTokenStats,
  getImprovements,
  getStrengths,
  getDrivers,
} from '@/lib/db/index-read';
import { getRoster } from '@/lib/db/roster';
import { getConnectOverview } from '@/lib/connectors/telemetry/store';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { TokenLens } from '@/components/panels/TokenLens';
import { ChangeList } from '@/components/panels/ChangeList';
import { AnalyticsGrid, MovementExplainer } from '@/components/panels/AnalyticsGrid';
import { OverviewFilters } from '@/components/panels/OverviewFilters';
import { getAnalytics, getOverviewFilterContext } from '@/lib/db/analytics';
import { TrendChart } from '@/components/charts/TrendChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { INK } from '@/app/tokens';
import { parsePeriod } from '@/lib/config/constants';
import { PerformanceInsights } from '@/components/panels/PerformanceInsights';

export const dynamic = 'force-dynamic';

export default async function FunctionView({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[]; repo?: string | string[]; team?: string | string[]; manager?: string | string[] }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const user = await getAuthUser();
  if (!user || !can(user, 'view_function_aggregates')) {
    return <div className="page"><PageHeader kicker="Overview" title="Management access required" description="Members use My View and My Actions. Organization aggregates are available to Management and Admin roles." /></div>;
  }
  const functionId = user.functionId;

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

  const requested = {
    repo: typeof sp.repo === 'string' ? sp.repo : '',
    team: typeof sp.team === 'string' ? sp.team : '',
    manager: typeof sp.manager === 'string' ? sp.manager : '',
  };
  const filteringRequested = Boolean(requested.repo || requested.team || requested.manager);
  const [meta, index, trend, tokenStats, improvements, strengths, drivers, roster, live, filterContext, unfilteredAnalytics] = await Promise.all([
    getMeta('function', functionId, period),
    getIndex('function', functionId, period),
    getTrend('function', functionId, period),
    getTokenStats(period),
    getImprovements('function', functionId),
    getStrengths('function', functionId),
    getDrivers('function', functionId, period),
    getRoster(functionId),
    getConnectOverview(functionId),
    getOverviewFilterContext(functionId, requested),
    filteringRequested ? Promise.resolve(null) : getAnalytics({ kind: 'function', id: functionId }, {}, period),
  ]);
  const analytics = unfilteredAnalytics ?? await getAnalytics({ kind: 'function', id: functionId }, filterContext.filter, period);

  return (
    <div className="page">
      <PageHeader
        kicker="Organization overview"
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

      <OverviewFilters context={filterContext} period={period} />
      <AnalyticsGrid
        data={analytics}
        scopeLabel={filterContext.label}
        scopeCaveat={filterContext.selected.repo ? 'PR and verified-link metrics use the repository filter. Token metrics remain people-scoped because current session metadata has no repository value.' : undefined}
      />

      <PerformanceInsights strengths={strengths} improvements={improvements} organization />

      <div className="row r2">
        <div className="card">
          <div className="cardhead"><h3>AI-Native Index trend</h3><span className="sub">{trend.granularityLabel}</span></div>
          <TrendChart trend={trend} color={trend.hue ?? INK} />
        </div>
        <TokenLens stats={tokenStats} />
      </div>

      <MovementExplainer movement={analytics.movement} filtered={filterContext.active} />

      {drivers.length ? <div className="card"><div className="cardhead"><h3>Narrative context</h3><span className="sub">agent explanation · never score computation</span></div><ChangeList drivers={drivers} /></div> : null}

      <div className="foot">L1 remains the unchanged deterministic weighted composite of the four dimensions, using the frozen index configuration recorded on each scored row.</div>
    </div>
  );
}
