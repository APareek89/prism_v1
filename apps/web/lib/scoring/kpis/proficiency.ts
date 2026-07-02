// lib/scoring/kpis/proficiency.ts
//
// Proficiency KPIs (PRD §4.2). All higher-is-better.
//
//   effective_skill_leverage = (retention/merge-rate on skill PRs)
//                              − (on non-skill PRs)                                 ↑
//   distinct_skills_authored = count(distinct skill/agent.md files authored)        ↑
//   multiplier_signal        = skills authored by this person used by ≥1 other      ↑
//                              (gates the top band)
//
// Anti-gaming (PRD §4.7): skill *invocation* counts only if the session produced a
// draft/shipped output (skill-credit-requires-output). A "skill PR" is a merged PR
// whose linked sessions used ≥1 skill AND produced output.

import type { KpiRaw, MemberRawRows, PrRow, SessionRow } from '../types';
import { mean, safeDiv } from '../math';

/** Per-PR retention rate (alive ÷ merged AI lines), null when no AI lines. */
function prRetention(pr: PrRow): number | null {
  return safeDiv(pr.aiLinesAliveAt30d, pr.aiLinesMerged);
}

/**
 * Effective skill-file leverage: the retention edge of skill-using PRs over
 * non-skill PRs. Positive means skills help. We use 30-day retention as the
 * outcome (a clean per-PR signal available here); the anchor target is +0.2
 * (PRD §4.4), i.e. a 20-point retention edge saturates.
 *
 * A PR is a "skill PR" when at least one of its linked sessions used a skill AND
 * produced output (anti-gaming credit gate).
 */
export function effectiveSkillLeverage(rows: MemberRawRows): KpiRaw {
  // Group sessions by linked PR.
  const sessionsByPr = new Map<string, SessionRow[]>();
  for (const s of rows.sessions) {
    if (s.linkedPrId === null) continue;
    const arr = sessionsByPr.get(s.linkedPrId) ?? [];
    arr.push(s);
    sessionsByPr.set(s.linkedPrId, arr);
  }

  const skillRetentions: number[] = [];
  const nonSkillRetentions: number[] = [];
  for (const pr of rows.prs) {
    if (!pr.isMerged) continue;
    const r = prRetention(pr);
    if (r === null) continue; // no AI lines → no retention signal
    const sessions = sessionsByPr.get(pr.prId) ?? [];
    const usedSkillWithOutput = sessions.some(
      (s) => s.producedOutput && s.skillsUsed.length > 0,
    );
    if (usedSkillWithOutput) skillRetentions.push(r);
    else nonSkillRetentions.push(r);
  }

  const skillMean = mean(skillRetentions);
  const nonSkillMean = mean(nonSkillRetentions);
  // Need BOTH sides to compute an edge; otherwise no signal (null, not 0).
  const value =
    skillMean === null || nonSkillMean === null
      ? null
      : skillMean - nonSkillMean;

  return {
    kpiId: 'effective_skill_leverage',
    dimension: 'proficiency',
    value,
    signals: skillRetentions.length + nonSkillRetentions.length,
  };
}

/** Distinct skills authored: count of distinct authored skill/agent.md files. */
export function distinctSkillsAuthored(rows: MemberRawRows): KpiRaw {
  const distinct = new Set(rows.skills.map((s) => s.skillName)).size;
  return {
    kpiId: 'distinct_skills_authored',
    dimension: 'proficiency',
    // count metric: value is the count itself, anchored 0→target.
    value: rows.skills.length === 0 && distinct === 0 ? 0 : distinct,
    signals: distinct,
  };
}

/** Multiplier signal: count of authored skills used by ≥1 *other* engineer. */
export function multiplierSignal(rows: MemberRawRows): KpiRaw {
  const reused = rows.skills.filter((s) => s.usedByOthersCount >= 1).length;
  return {
    kpiId: 'multiplier_signal',
    dimension: 'proficiency',
    value: rows.skills.length === 0 && reused === 0 ? 0 : reused,
    signals: rows.skills.length,
  };
}

/** All Proficiency KPIs for one member. */
export function proficiencyKpis(rows: MemberRawRows): KpiRaw[] {
  return [
    effectiveSkillLeverage(rows),
    distinctSkillsAuthored(rows),
    multiplierSignal(rows),
  ];
}
