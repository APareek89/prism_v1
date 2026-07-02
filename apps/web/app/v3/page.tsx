// /v3 — Team view (v3 preview). A structural mirror of app/(views)/team/page.tsx:
// .top header → .daterow pills + confidence bar → the roster card → .foot note.

import { activePin, teamRows } from '@/lib/v3/read';
import { TeamTable, type TeamTableRow } from '@/components/v3/TeamTable';

export const dynamic = 'force-dynamic';

export default async function V3TeamPage() {
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

  // View-level confidence = median of published main-index confidences (the
  // .conf bar treatment, exactly like the v1 Team view).
  const confs = vm.map((r) => r.mainConfidence).sort((a, b) => a - b);
  const median = confs.length ? confs[Math.floor(confs.length / 2)]! : 0;
  const confLabel = median >= 0.75 ? 'High' : median >= 0.55 ? 'Medium' : median >= 0.4 ? 'Low' : 'Insufficient';

  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>Team view</h2>
          <p>v3.0 preview · per-engineer breakdown across BOTH indexes · coaching signal, not a leaderboard</p>
        </div>
      </div>

      <div className="daterow">
        <span className="pill">Window <b>trailing 28d</b></span>
        <span className="pill">Engineers <b>{vm.length}</b></span>
        <span className="pill">Config <b>v{pin.version}</b></span>
        <span className="pill">As-of <b>{pin.date ?? '—'}</b></span>
        <span className="pill" style={{ color: 'var(--warn)' }}>Data <b>demo</b></span>
        <span className="conf">
          confidence
          <span className="bar"><i style={{ width: `${Math.round(median * 100)}%` }} /></span>
          {confLabel}
        </span>
      </div>

      <div className="card">
        <div className="cardhead">
          <h3>Squad roster — main + harness</h3>
          <span className="sub">MAIN 15/35/50 over Core-6 · HARNESS separate (12–15) · click a header to sort · drill in for insights</span>
        </div>
        <TeamTable rows={vm} />
      </div>

      <div className="foot">
        Individual scores carry wide confidence bands and exist for coaching only. The harness index
        never mixes into the main number — the linkage engine connects them with evidence.
      </div>
    </div>
  );
}
