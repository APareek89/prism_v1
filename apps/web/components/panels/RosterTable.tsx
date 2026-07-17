// components/panels/RosterTable.tsx
//
// The squad roster — a faithful port of the Team view `<table>` from the approved
// design. One row per member: avatar + name/role, L1 index, the four dimension-hued
// L2 scores, tokens/PR, the 7-day delta, and a "drill in" link to /team/[id]. The
// `you` row gets the highlighted treatment. When the roster is empty it renders a
// single "no engineers onboarded yet" row (no fabricated members).

import Link from 'next/link';
import { fmtScore } from '@/lib/format';
import { ROUTES } from '@/lib/config/constants';
import { DIMENSION_HUES } from '@/app/tokens';
import type { MemberRowDTO } from '@/lib/ui/view-models';

export interface RosterTableProps {
  members: MemberRowDTO[];
}

/** 7-day delta cell color, matching the design's inline coloring. */
function d7Color(d7: MemberRowDTO['d7']): string {
  if (!d7) return 'var(--mut)';
  if (d7.dir === 'up') return 'var(--good)';
  if (d7.dir === 'down') return 'var(--bad)';
  return 'var(--mut)';
}

export function RosterTable({ members }: RosterTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>Engineer</th>
          <th>L1 index</th>
          <th>Usage</th>
          <th>Efficiency</th>
          <th>Effectiveness</th>
          <th>Proficiency</th>
          <th>Tokens/PR</th>
          <th>7d</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {members.length === 0 ? (
          <tr>
            <td colSpan={9} style={{ color: 'var(--mut)', textAlign: 'center', padding: '28px 12px' }}>
              No engineers discovered yet — connect or resync the GitHub App to populate the team.
            </td>
          </tr>
        ) : (
          members.map((m) => {
            const initial = m.name.charAt(0).toUpperCase();
            return (
              <tr key={m.id} className={m.you ? 'you' : undefined}>
                <td>
                  <div className="mem">
                    <span className={`av${m.you ? ' y' : ''}`}>{initial}</span>
                    <div>
                      <b>{m.name}</b>
                      <small>{m.role}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="idxmini">{fmtScore(m.l1)}</span>
                </td>
                <td className="trendcell" style={{ color: DIMENSION_HUES.usage }}>
                  {fmtScore(m.l2.usage)}
                </td>
                <td className="trendcell" style={{ color: DIMENSION_HUES.efficiency }}>
                  {fmtScore(m.l2.eff)}
                </td>
                <td className="trendcell" style={{ color: DIMENSION_HUES.effectiveness }}>
                  {fmtScore(m.l2.effness)}
                </td>
                <td className="trendcell" style={{ color: DIMENSION_HUES.proficiency }}>
                  {fmtScore(m.l2.prof)}
                </td>
                <td className="trendcell" style={{ color: 'var(--mut)' }}>
                  {m.tokensPerPrLabel}
                </td>
                <td className="trendcell" style={{ color: d7Color(m.d7) }}>
                  {m.d7 ? m.d7.label : '—'}
                </td>
                <td>
                  <Link
                    className="linkbtn"
                    href={ROUTES.member(m.id)}
                    style={{ textDecoration: 'none', display: 'inline-block' }}
                  >
                    drill in
                  </Link>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
