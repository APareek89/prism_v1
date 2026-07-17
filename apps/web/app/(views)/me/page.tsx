import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { WorkspaceTelemetryCard } from '@/components/connect/WorkspaceTelemetryCard';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { CourseCard } from '@/components/panels/CourseCard';
import { PrInsightList } from '@/components/panels/PrInsightList';
import { RecommendationList } from '@/components/panels/RecommendationList';
import { EmptyState } from '@/components/ui/EmptyState';
import { getAuthUser } from '@/lib/auth/session';
import { getMyView, getPrInsights, getRecommendations, getCourse } from '@/lib/db';
import { getPersonalTelemetryOverview } from '@/lib/connectors/telemetry/store';

export const dynamic = 'force-dynamic';

export default async function MyWorkspacePage() {
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

  const [myView, prInsights, recommendations, course, telemetry] = await Promise.all([
    getMyView(user.employeeId),
    getPrInsights(user.employeeId),
    getRecommendations(user.employeeId),
    getCourse(user.employeeId),
    getPersonalTelemetryOverview({ functionId: user.functionId, employeeId: user.employeeId }),
  ]);
  const { index, meta } = myView;

  return (
    <div className="page">
      <PageHeader
        kicker="Private workspace"
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

      <WorkspaceTelemetryCard
        signedIn
        displayName={telemetry.employeeName || user.displayName}
        email={user.email}
        overview={telemetry}
      />

      <section className="workspace-evidence-section">
        <div className="section-heading">
          <div><span className="page-kicker">Your evidence</span><h2>What Prism can responsibly say today</h2></div>
          <span className="count-badge">{meta.prsInWindow ?? 0} merged PRs in window</span>
        </div>

        <div className="hero">
          <IndexHero index={index} vsSquad />
          <SpectrumPanel spectrum={index.spectrum} showVsSquad />
        </div>

        <div className="row" style={{ gridTemplateColumns: '1fr' }}>
          <CourseCard course={course} />
        </div>

        <div className="row r2">
          <div className="card">
            <div className="cardhead"><h3>Recent PR insights</h3><span className="sub">real linked evidence only</span></div>
            {prInsights.length ? <PrInsightList insights={prInsights} /> : <EmptyState compact title="No linked PR insights yet" hint="connect your coding agent and run the production pipeline" />}
          </div>
          <div className="card">
            <div className="cardhead"><h3>Recommended for you</h3><span className="sub">monitored for adoption</span></div>
            {recommendations.length ? <RecommendationList recommendations={recommendations} /> : <EmptyState compact title="No recommendation yet" hint="Prism waits for enough evidence instead of inventing guidance" />}
          </div>
        </div>
      </section>

      <div className="foot">Your workspace is private. Managers see function-level aggregates and coaching themes—not your raw session content.</div>
    </div>
  );
}
