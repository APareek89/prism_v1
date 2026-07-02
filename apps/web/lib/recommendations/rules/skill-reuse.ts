// lib/recommendations/rules/skill-reuse.ts
//
// PROCESS rec — "reuse skills in your Claude Code sessions".
//
// Grounding: a member who runs CC sessions that ship code but invoke NO skills is leaving
// the proficiency multiplier on the table. We measure the SHARE of window sessions that
// used ≥1 skill; when that share is below the reuse floor (and there is real session
// volume), we suggest adopting skill reuse. before = current reuse share, after = floor
// target, delta = the gap. All computed in code.

import type { Rule } from '../types';
import { SKILL_REUSE } from '../thresholds';

const MIN_SESSIONS = SKILL_REUSE.minSessions;
const REUSE_FLOOR = SKILL_REUSE.floor;

export const skillReuseRule: Rule = (ctx) => {
  const total = ctx.sessions.length;
  if (total < MIN_SESSIONS) return null; // not enough sessions to judge reuse

  const withSkill = ctx.sessions.filter((s) => s.skillsUsed.length > 0).length;
  const share = withSkill / total;
  if (share >= REUSE_FLOOR) return null; // already reusing enough

  const delta = Number((REUSE_FLOOR - share).toFixed(3));
  return {
    kind: 'process',
    ref: 'skill-reuse',
    rationale:
      `Only ${withSkill} of ${total} recent sessions invoked a skill ` +
      `(${pct(share)} reuse). Pull in an existing skill before starting — reused skills ` +
      `raise retention and cut iterations.`,
    detectedVia: 'skill-reuse',
    dimension: 'proficiency',
    evidence: {
      metric: 'session_skill_reuse_share',
      before: Number(share.toFixed(3)),
      after: REUSE_FLOOR,
      delta,
      unit: 'share',
      signals: total,
    },
  };
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
