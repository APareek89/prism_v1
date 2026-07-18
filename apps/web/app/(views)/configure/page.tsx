import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { ConfigurationClient } from '@/components/configuration/ConfigurationClient';
import { getAuthUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { getConfigurationSnapshot } from '@/lib/configuration/store';

export const dynamic = 'force-dynamic';

export default async function ConfigurationPage() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return <div className="page"><PageHeader kicker="Configuration" title="Administrator access required" description="Configuration changes affect data processing, access, and future score versions, so this area is restricted to workspace administrators." /></div>;
  }
  const snapshot = await getConfigurationSnapshot(user.functionId);
  const complete = Object.values(snapshot.profile.completed).filter(Boolean).length;
  return (
    <div className="page configuration-page">
      <PageHeader
        kicker="Admin-only workspace setup"
        title="Configure what Prism may measure"
        description="Connect evidence, approve its use, validate the index, scope the organization, and assign access. Each confirmation is timestamped and auditable."
        meta={<><MetaChip label="Readiness" value={`${complete}/5 steps`} tone={complete === 5 ? 'accent' : 'warning'} /><MetaChip label="GitHub" value={snapshot.github.connected ? 'Connected' : 'Required'} /><MetaChip label="Index config" value={`v${snapshot.index.version}`} /><MetaChip label="Measurement starts" value={snapshot.profile.measurementStartDate} /></>}
      />
      <ConfigurationClient initial={snapshot} currentEmployeeId={user.employeeId} />
    </div>
  );
}
