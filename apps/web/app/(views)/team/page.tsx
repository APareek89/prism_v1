// app/(views)/team/page.tsx
//
// Team view — the faithful M1 port of the `#team` section of the approved design.
// Per-section header (`.top` + PeriodToggle), the `.daterow` context pills, the squad
// roster card (RosterTable, which maps N members and links each to /team/[id]), and
// the coaching-not-leaderboard footnote.
//
// Server Component. The roster comes from the data layer (lib/db) and is member-count
// agnostic — it renders cleanly empty (a "no engineers onboarded yet" row) until the
// roster is populated, and lights up for 1 or N members.

import { getCurrentFunctionId } from '@/lib/db/_base';
import { getMeta } from '@/lib/db/index-read';
import { getRoster } from '@/lib/db/roster';
import { RosterTable } from '@/components/panels/RosterTable';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import { parsePeriod } from '@/lib/config/constants';

export default async function TeamView({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp.period);

  const functionId = await getCurrentFunctionId();

  // No function resolved (keyless / no roster) → render the chrome with an empty
  // roster (RosterTable shows the "no engineers onboarded yet" row). No fabrication.
  const [meta, roster] = functionId
    ? await Promise.all([getMeta('team', functionId, period), getRoster(functionId)])
    : [null, []];

  const confWidth = meta ? Math.max(0, Math.min(100, meta.confidencePct)) : 0;

  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>Team view</h2>
          <p>Per-engineer breakdown · coaching signal, not a leaderboard</p>
        </div>
        <PeriodToggle />
      </div>

      <div className="daterow">
        <span className="pill">
          Squad <b>{meta?.scopeLabel ?? '—'}</b>
        </span>
        <span className="pill">
          Engineers <b>{roster.length}</b>
        </span>
        <span className="conf">
          confidence
          <span className="bar">
            <i style={{ width: `${confWidth}%` }} />
          </span>
          {meta?.confidence ?? 'Insufficient'}
        </span>
      </div>

      <div className="card">
        <div className="cardhead">
          <h3>Squad roster</h3>
          <span className="sub">click &ldquo;drill in&rdquo; to open a member · ranked by AI-Native Index</span>
        </div>
        <RosterTable members={roster} />
      </div>

      <div className="foot">
        Individual scores carry wide confidence bands and exist for coaching only. The function
        headline (L1) is the unit of accountability — never a per-engineer ranking.
      </div>
    </div>
  );
}
