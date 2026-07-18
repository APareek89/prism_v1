import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { OrgActionsClient } from '@/components/actions/OrgActionsClient';
import { getAuthUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/roles';
import { getOrgActions } from '@/lib/actions/store';

export const dynamic = 'force-dynamic';

export default async function OrgActionsPage() {
  const user = await getAuthUser(); if (!user || !can(user, 'manage_org_actions')) return <div className="page"><PageHeader kicker="Org Actions" title="Management access required" description="Organization interventions are available to Managers, Management, and Admins." /></div>;
  const data = await getOrgActions(user);
  return <div className="page"><PageHeader kicker="Org Actions" title="Run improvements as accountable experiments" description="Turn real connector gaps and agent-narrated opportunities into owned actions. Actioned never means impact proven; follow-up evidence is shown separately." meta={<><MetaChip label="Active actions" value={data.actions.filter((action) => !['verified','dismissed'].includes(action.status)).length} tone="accent" /><MetaChip label="Evidence-backed candidates" value={data.candidates.length} /><MetaChip label="Causality" value="Never assumed" /></>} /><OrgActionsClient actions={data.actions} candidates={data.candidates} /></div>;
}
