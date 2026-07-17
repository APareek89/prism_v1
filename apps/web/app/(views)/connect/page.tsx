import { getAuthUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { isGithubConfigured, listInstallations } from '@/lib/connectors/github/client';
import { getConnectOverview } from '@/lib/connectors/telemetry/store';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { ConnectClient } from '@/components/connect/ConnectClient';

export const dynamic = 'force-dynamic';

export default async function ConnectPage() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return (
      <div className="main">
        <PageHeader
          kicker="Data connections"
          title="Administrator access required"
          description="Only a Prism administrator can connect organization-level engineering data or create personal telemetry invitations."
        />
      </div>
    );
  }

  const [overview, installations] = await Promise.all([
    getConnectOverview(user.functionId),
    isGithubConfigured() ? listInstallations() : Promise.resolve([]),
  ]);
  const connectedPeople = overview.employees.filter(
    (employee) => employee.codexStatus === 'connected' || employee.claudeStatus === 'connected',
  ).length;

  return (
    <div className="main connect-page">
      <PageHeader
        kicker="Live data foundation"
        title="Connect the work, then the AI sessions"
        description="GitHub defines the team and delivery evidence. Each developer then opts in to metadata-only Codex or Claude Code telemetry with one personal setup command."
        meta={
          <>
            <MetaChip label="GitHub" value={overview.github.status === 'connected' ? 'Connected' : 'Needs setup'} tone={overview.github.status === 'connected' ? 'accent' : 'warning'} />
            <MetaChip label="Team discovered" value={overview.employees.length} />
            <MetaChip label="AI connected" value={`${connectedPeople}/${overview.employees.length || 0}`} />
          </>
        }
      />

      <ConnectClient
        overview={overview}
        installations={installations}
        currentEmployeeId={user.employeeId}
        githubConfigured={isGithubConfigured()}
      />
    </div>
  );
}
