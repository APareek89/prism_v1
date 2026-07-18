import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { WorkspaceTelemetryCard } from '@/components/connect/WorkspaceTelemetryCard';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { PrInsightList } from '@/components/panels/PrInsightList';
import { PerformanceInsights } from '@/components/panels/PerformanceInsights';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAuthUser } from '@/lib/auth/session';
import { getMyView, getPrInsights, getImprovements, getStrengths } from '@/lib/db';
import { getPersonalTelemetryOverview } from '@/lib/connectors/telemetry/store';
import { AnalyticsGrid, MovementExplainer } from '@/components/panels/AnalyticsGrid';
import { getAnalytics } from '@/lib/db/analytics';
import Link from 'next/link';
import { getConnectionPolicy } from '@/lib/configuration/store';
import { parsePeriod } from '@/lib/config/constants';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import { SectionNav } from '@/components/layout/SectionNav';

export const dynamic = 'force-dynamic';

export default async function MyWorkspacePage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; period?: string | string[] }> }) {
  const params = await searchParams;
  const tab = params.tab === 'connection' ? 'connection' : 'performance';
  const period = parsePeriod(params.period);
  const user = await getAuthUser();

  if (!user) {
    return (
      <div className="page">
        <PageHeader
          kicker="Private workspace"
          title="Your AI workflow starts with your login"
          description="Sign in with the email your administrator assigned to your GitHub identity. Your personal connection command will appear here."
          meta={<MetaChip label="Access" value="Sign-in required" tone="warning" />}
        />
        <WorkspaceTelemetryCard signedIn={false} displayName="Developer" email={null} overview={null} />
      </div>
    );
  }

  if (tab === 'connection') {
    const [telemetry, connectionPolicy] = await Promise.all([
      getPersonalTelemetryOverview({ functionId: user.functionId, employeeId: user.employeeId }),
      getConnectionPolicy(user.functionId),
    ]);
    return <div className="page">
      <PageHeader
        kicker="My View · private"
        title={`Your AI connection, ${user.displayName.split(' ')[0]}`}
        description="Run the personal command in the environment where your coding agent actually executes, then verify that metadata is flowing."
        meta={<><MetaChip label="Identity" value={user.email ?? user.displayName} tone="accent" /><MetaChip label="Data" value="Real only" /></>}
      />
      <div className="subview-shell"><WorkspaceTabs tab={tab} period={period} /><div className="subview-stage">
        <WorkspaceTelemetryCard signedIn displayName={telemetry.employeeName || user.displayName} email={user.email} overview={telemetry} allowedProviders={connectionPolicy.allowedProviders} connectionMethods={connectionPolicy.connectionMethods} />
        <div className="foot">Your personal token is bound to your identity. Prism stores metadata counters and verified PR links—never prompts, responses, source code, commands, or tool payloads.</div>
      </div></div>
    </div>;
  }

  // Performance no longer waits on connection-policy and invite reads. This keeps
  // the common tab transition bounded to the evidence it actually renders.
  const [myView, prInsights, analytics, improvements, strengths] = await Promise.all([
    getMyView(user.employeeId, period),
    getPrInsights(user.employeeId),
    getAnalytics({ kind: 'employee', id: user.employeeId, functionId: user.functionId }, {}, period),
    getImprovements('employee', user.employeeId),
    getStrengths('employee', user.employeeId),
  ]);
  const { index, meta } = myView;

  return (
    <div className="page">
      <PageHeader
        kicker="My View · private"
        title={`Your AI workflow, ${user.displayName.split(' ')[0]}`}
        description="Review the delivery and coding-agent evidence linked only to your account, with honest prior-period comparisons."
        actions={<PeriodToggle />}
        meta={<><MetaChip label="Identity" value={user.email ?? user.displayName} tone="accent" /><MetaChip label="Window" value={meta.windowLabel} /><MetaChip label="Confidence" value={`${meta.confidence} · ${meta.confidencePct}%`} /><MetaChip label="Data" value="Real only" /></>}
      />

      <div className="subview-shell"><WorkspaceTabs tab={tab} period={period} /><div className="subview-stage"><section className="workspace-evidence-section">
        <div className="section-heading">
          <div><span className="page-kicker">Your evidence</span><h2>What Prism can responsibly say today</h2></div>
          <span className="count-badge">{meta.prsInWindow ?? 0} merged PRs in window</span>
        </div>

        <div className="hero">
          <IndexHero index={index} vsSquad />
          <SpectrumPanel spectrum={index.spectrum} showVsSquad />
        </div>

        <PerformanceInsights strengths={strengths} improvements={improvements} />
        <AnalyticsGrid data={analytics} personal />
        <MovementExplainer movement={analytics.movement} />

        <div className="row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="cardhead"><h3>Recent evidence notes</h3><span className="sub">narrative over real linked PRs</span></div>
            {prInsights.length ? <PrInsightList insights={prInsights} /> : <EmptyState compact title="No linked PR insights yet" hint="connect your coding agent and run the production pipeline" />}
          </div>
        </div>
      </section>

      <div className="foot">Your workspace is private. Managers see only their configured team’s coaching boundary—not your raw session content.</div>
      </div></div>
    </div>
  );
}

function WorkspaceTabs({ tab, period }: { tab: 'connection' | 'performance'; period: ReturnType<typeof parsePeriod> }) {
  return <SectionNav label="My View" items={[
    { href: `/me?tab=performance&period=${period}`, label: 'Performance', description: 'Your index and evidence', active: tab === 'performance' },
    { href: `/me?tab=connection&period=${period}`, label: 'Connection', description: 'Personal coding agents', active: tab === 'connection' },
  ]} />;
}
