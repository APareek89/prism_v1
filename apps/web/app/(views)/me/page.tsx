import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { WorkspaceTelemetryCard } from '@/components/connect/WorkspaceTelemetryCard';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { PrInsightList } from '@/components/panels/PrInsightList';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAuthUser } from '@/lib/auth/session';
import { getMyView, getPrInsights } from '@/lib/db';
import { getPersonalTelemetryOverview } from '@/lib/connectors/telemetry/store';
import { AnalyticsGrid, MovementExplainer } from '@/components/panels/AnalyticsGrid';
import { getAnalytics } from '@/lib/db/analytics';
import Link from 'next/link';
import { getConnectionPolicy } from '@/lib/configuration/store';

export const dynamic = 'force-dynamic';

export default async function MyWorkspacePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === 'connection' ? 'connection' : 'performance';
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
        <WorkspaceTelemetryCard
          signedIn={false}
          displayName="Developer"
          email={null}
          overview={null}
        />
      </div>
    );
  }

  const [myView, prInsights, telemetry, analytics, connectionPolicy] = await Promise.all([
    getMyView(user.employeeId),
    getPrInsights(user.employeeId),
    getPersonalTelemetryOverview({ functionId: user.functionId, employeeId: user.employeeId }),
    getAnalytics({ kind: 'employee', id: user.employeeId, functionId: user.functionId }),
    getConnectionPolicy(user.functionId),
  ]);
  const { index, meta } = myView;

  return (
    <div className="page">
      <PageHeader
        kicker="My View · private"
        title={`Your AI workflow, ${user.displayName.split(' ')[0]}`}
        description="Connect your coding agent, verify that metadata is flowing, and review only the real evidence linked to your account."
        meta={
          <>
            <MetaChip label="Identity" value={user.email ?? user.displayName} tone="accent" />
            <MetaChip label="Window" value={meta.windowLabel} />
            <MetaChip label="Confidence" value={`${meta.confidence} · ${meta.confidencePct}%`} />
            <MetaChip label="Data" value="Real only" />
          </>
        }
      />

      <nav className="view-tabs" aria-label="My View sections"><Link className={tab === 'performance' ? 'active' : ''} href="/me?tab=performance">Performance</Link><Link className={tab === 'connection' ? 'active' : ''} href="/me?tab=connection">Connection</Link></nav>

      {tab === 'connection' ? <><WorkspaceTelemetryCard
        signedIn
        displayName={telemetry.employeeName || user.displayName}
        email={user.email}
        overview={telemetry}
        allowedProviders={connectionPolicy.allowedProviders}
        connectionMethods={connectionPolicy.connectionMethods}
      /><div className="foot">Your personal token is bound to your identity. Prism stores metadata counters and verified PR links—never prompts, responses, source code, commands, or tool payloads.</div></> : null}

      {tab === 'performance' ? <section className="workspace-evidence-section">
        <div className="section-heading">
          <div><span className="page-kicker">Your evidence</span><h2>What Prism can responsibly say today</h2></div>
          <span className="count-badge">{meta.prsInWindow ?? 0} merged PRs in window</span>
        </div>

        <div className="hero">
          <IndexHero index={index} vsSquad />
          <SpectrumPanel spectrum={index.spectrum} showVsSquad />
        </div>

        <PersonalSignals spectrum={index.spectrum} />
        <AnalyticsGrid data={analytics} personal />
        <MovementExplainer movement={analytics.movement} />

        <div className="row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="cardhead"><h3>Recent evidence notes</h3><span className="sub">narrative over real linked PRs</span></div>
            {prInsights.length ? <PrInsightList insights={prInsights} /> : <EmptyState compact title="No linked PR insights yet" hint="connect your coding agent and run the production pipeline" />}
          </div>
        </div>
      </section> : null}

      <div className="foot">Your workspace is private. Managers see only their configured team’s coaching boundary—not your raw session content.</div>
    </div>
  );
}

function PersonalSignals({ spectrum }: { spectrum: Awaited<ReturnType<typeof getMyView>>['index']['spectrum'] }) {
  const scored = spectrum.filter((item) => item.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const strong = scored.filter((item) => (item.score ?? 0) >= 60);
  const improve = scored.filter((item) => (item.score ?? 100) < 60);
  return <div className="personal-signal-grid"><section className="card"><div className="cardhead"><h3>Going well</h3><span className="sub">high deterministic dimensions</span></div>{strong.length ? strong.map((item) => <div className="personal-signal" key={item.dimension}><span>{item.label}</span><strong>{item.score?.toFixed(1)}</strong><p>This dimension is at or above 60 from qualifying evidence in the current window.</p></div>) : <EmptyState compact title="No high dimension yet" hint="this is an observation, not a recommendation" />}</section><section className="card"><div className="cardhead"><h3>Needs improvement</h3><span className="sub">low or missing dimensions</span></div>{improve.length ? improve.map((item) => <div className="personal-signal needs" key={item.dimension}><span>{item.label}</span><strong>{item.score?.toFixed(1)}</strong><p>This dimension is below 60. Open My Actions for evidence-backed next steps.</p></div>) : <EmptyState compact title="Nothing scored low" hint="missing evidence remains unpublished" />}</section></div>;
}
