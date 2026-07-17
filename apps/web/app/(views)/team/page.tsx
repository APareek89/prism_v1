import { getCurrentFunctionId } from '@/lib/db/_base';
import { getMeta } from '@/lib/db/index-read';
import { getRoster } from '@/lib/db/roster';
import { getConnectOverview } from '@/lib/connectors/telemetry/store';
import { RosterTable } from '@/components/panels/RosterTable';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { parsePeriod } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

export default async function TeamView({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);
  const functionId = await getCurrentFunctionId();

  const [meta, roster, live] = functionId
    ? await Promise.all([
        getMeta('team', functionId, period),
        getRoster(functionId),
        getConnectOverview(functionId),
      ])
    : [null, [], null];

  const connectedPeople = live?.employees.filter(
    (employee) => employee.codexStatus === 'connected' || employee.claudeStatus === 'connected',
  ).length ?? 0;

  return (
    <div className="page">
      <PageHeader
        kicker="Real team"
        title="Support people without turning Prism into a leaderboard"
        description="The roster comes from the connected GitHub installation. Scores remain blank until each real user has enough linked evidence."
        actions={<PeriodToggle />}
        meta={
          <>
            <MetaChip label="GitHub members" value={roster.length} tone="accent" />
            <MetaChip label="AI connected" value={`${connectedPeople}/${roster.length}`} />
            <MetaChip label="Confidence" value={meta?.confidence ?? 'Insufficient'} />
            <MetaChip label="Data" value="Real only" />
          </>
        }
      />

      <div className="card">
        <div className="cardhead"><h3>Engineering roster</h3><span className="sub">coaching signal, never a performance ranking</span></div>
        {functionId ? <div className="team-table-wrap"><RosterTable members={roster} /></div> : <EmptyState title="No workspace linked" hint="sign in with an invited team email" />}
      </div>

      <div className="foot">Individual evidence is visible only within the role-based coaching boundary. Raw session content is never collected.</div>
    </div>
  );
}
