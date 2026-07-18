import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { MyActionsClient } from '@/components/actions/MyActionsClient';
import { getAuthUser } from '@/lib/auth/session';
import { getMyActions, PUBLIC_LEARNING_RESOURCES } from '@/lib/actions/store';

export const dynamic = 'force-dynamic';

export default async function MyActionsPage() {
  const user = await getAuthUser();
  if (!user) return <div className="page"><PageHeader kicker="My Actions" title="Sign in to continue" description="Actions are personal and auditable, so Prism needs your linked identity." /></div>;
  const data = await getMyActions(user.employeeId);
  return <div className="page"><PageHeader kicker="My Actions · private" title="Turn evidence into deliberate practice" description="Recommendations come from deterministic rules over your real evidence. Marking an item actioned records your intent; Prism waits for later evidence before claiming adoption or impact." meta={<><MetaChip label="Open recommendations" value={data.recommendations.filter((item) => !['adopted','dismissed'].includes(item.status)).length} tone="accent" /><MetaChip label="Assigned courses" value={data.courses.length} /><MetaChip label="Public resources" value={PUBLIC_LEARNING_RESOURCES.length} /></>} /><MyActionsClient recommendations={data.recommendations} assignments={data.courses} resources={PUBLIC_LEARNING_RESOURCES} /></div>;
}
