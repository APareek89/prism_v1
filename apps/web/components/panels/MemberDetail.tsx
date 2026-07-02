// components/panels/MemberDetail.tsx
//
// Member detail (drill-in) — a faithful port of the `#memberdetail` section from the
// approved design (manager view of one member). Composes the shared IndexHero +
// SpectrumPanel (in "vs squad" mode) with the member-specific InsightList ("What needs
// to improve"), GoingWellList ("What's going well — and why"), and CommsLog
// ("Communications & actions sent"). The page owns the BackLink + the `.main` frame;
// this component owns everything from `.top` down. No fabricated values — each panel
// degrades to its own empty treatment.

import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { InsightList } from '@/components/panels/InsightList';
import { GoingWellList } from '@/components/panels/GoingWellList';
import { CommsLog } from '@/components/panels/CommsLog';
import { PeriodToggle } from '@/components/layout/PeriodToggle';
import type {
  CommsEntryDTO,
  ImprovementDTO,
  IndexDTO,
  MemberRowDTO,
  MetaDTO,
  WellItemDTO,
} from '@/lib/ui/view-models';

export interface MemberDetailProps {
  member: MemberRowDTO;
  meta: MetaDTO;
  index: IndexDTO;
  improvements: ImprovementDTO[];
  well: WellItemDTO[];
  comms: CommsEntryDTO[];
}

/** Confidence bar fill width (0–100) clamped. */
function confWidth(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}

export function MemberDetail({
  member,
  meta,
  index,
  improvements,
  well,
  comms,
}: MemberDetailProps) {
  const d7 = member.d7;

  return (
    <>
      <div className="top">
        <div className="ttl">
          <h2>{member.name}</h2>
          <p>{member.role} · member detail (manager view)</p>
        </div>
        <PeriodToggle />
      </div>

      <div className="daterow">
        <span className="pill">
          AI-Native Index <b>{index.l1 ?? '—'}</b>
        </span>
        <span className="pill">
          7-day <b>{d7 ? d7.label : '—'}</b>
        </span>
        <span className="conf">
          confidence
          <span className="bar">
            <i style={{ width: `${confWidth(meta.confidencePct)}%` }} />
          </span>
          {meta.confidence}
        </span>
      </div>

      <div className="hero">
        <IndexHero index={index} vsSquad />
        <SpectrumPanel spectrum={index.spectrum} showVsSquad />
      </div>

      <div className="row r2">
        <div className="card">
          <div className="cardhead">
            <h3>What needs to improve</h3>
            <span className="sub">ranked by index impact</span>
          </div>
          <InsightList
            items={improvements}
            emptyHint="coaching themes appear once this member has a scored window"
          />
        </div>
        <div className="card">
          <div className="cardhead">
            <h3>What&rsquo;s going well — and why</h3>
            <span className="sub">improvement linked to the action behind it</span>
          </div>
          <GoingWellList items={well} />
        </div>
      </div>

      <div className="row" style={{ gridTemplateColumns: '1fr' }}>
        <div className="card">
          <div className="cardhead">
            <h3>Communications &amp; actions sent</h3>
            <span className="sub">nudges delivered → did they act? (tracked via My view + the data)</span>
          </div>
          <CommsLog entries={comms} />
        </div>
      </div>

      <div className="foot">
        Manager view of one member: coaching themes, the actions that improved them, and whether
        nudges were acted on. Raw per-PR detail stays in the member&rsquo;s private My view.
      </div>
    </>
  );
}
