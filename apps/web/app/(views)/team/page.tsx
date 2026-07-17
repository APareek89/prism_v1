import { activePin, teamRows } from '@/lib/v3/read';
import { TeamTable, type TeamTableRow } from '@/components/v3/TeamTable';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';

export const dynamic = 'force-dynamic';

export default async function TeamView() {
  const pin = await activePin();
  const rows = await teamRows(pin);
  const vm: TeamTableRow[] = rows.map((r) => ({
    id: r.dev.id,
    handle: r.dev.handle,
    name: r.dev.name,
    archetype: r.dev.archetype,
    team: r.dev.team,
    mainScore: r.main?.score ?? null,
    band: r.main?.band ?? null,
    mainConfidence: r.main?.confidence ?? 0,
    l0Forced: r.main?.gates.l0_forced ?? false,
    l5Capped: r.main?.gates.l5_capped ?? false,
    multiplier: r.main?.gates.multiplier_signal ?? 0,
    dimensions: r.main?.dimensions ?? {},
    harnessScore: r.harness?.score ?? null,
    harnessConfidence: r.harness?.confidence ?? 0,
    aiSharePct: r.aiSharePct,
    insightCount: r.insightCount,
    recCount: r.recCount,
  }));

  const published = vm.filter((r) => r.mainScore !== null).length;
  const workflowPlus = vm.filter((r) => (r.mainScore ?? -1) >= 55).length;
  const lowSignal = vm.filter((r) => r.mainConfidence < .4).length;
  const practiceGap = vm.filter((r) => (r.mainScore ?? -1) >= 55 && (r.harnessScore ?? 101) < 50).length;

  return (
    <div className="page">
      <PageHeader
        kicker="People · coaching view"
        title="Find the support that unlocks the team"
        description="Start with evidence, not rank. Each profile shows where a workflow is constrained and which practice is most likely to help."
        meta={
          <>
            <MetaChip label="Window" value="Trailing 28 days" />
            <MetaChip label="As of" value={pin.date ?? 'Awaiting compute'} />
            <MetaChip label="Config" value={`v${pin.version}`} />
            <MetaChip label="Privacy" value="Coaching signals only" tone="accent" />
          </>
        }
      />

      <div className="team-summary" aria-label="Team summary">
        <div className="summary-stat"><span>Engineers with a published MAIN index</span><strong>{published}<small className="muted2"> / {vm.length}</small></strong></div>
        <div className="summary-stat"><span>Workflow or stronger</span><strong>{workflowPlus}</strong></div>
        <div className="summary-stat"><span>Strong output, practice gap</span><strong>{practiceGap}</strong></div>
        <div className="summary-stat"><span>Need more signal before coaching</span><strong>{lowSignal}</strong></div>
      </div>

      <section className="card">
        <div className="cardhead">
          <div><span className="page-kicker">Support map</span><h3>People and their current constraint</h3></div>
          <span className="sub">Alphabetical by default · scores are not performance ratings</span>
        </div>
        <TeamTable rows={vm} />
      </section>

      <div className="foot">Individual scores carry confidence and evidence context. Use them to improve systems and habits—not to compare human performance.</div>
    </div>
  );
}
