// lib/scoring/anti-gaming.ts
//
// Centralized anti-gaming guards (PRD §4.7). Several guards are enforced at their
// natural site (within-bucket iterations in efficiency.ts; cap-at-target in
// normalize.ts; skill-credit-requires-output in proficiency.ts; self-revert
// exclusion in effectiveness.ts). This module collects the cross-cutting ones —
// dropping BYO/unmatched sessions, flagging label-less commit spam — into one place
// so compute-daily applies them uniformly before any KPI runs, and so the guard set
// is auditable/testable in isolation.

import type { MemberRawRows, PrRow, SessionRow } from './types';

/** Drop CC sessions flagged BYO/unmatched/missing-stream — they must not count
 *  toward AI rates or confidence (PRD §4.6 attribution rule, §7.2.1). */
export function dropExcludedSessions(
  sessions: readonly SessionRow[],
): SessionRow[] {
  return sessions.filter((s) => !s.excludedFromAiRates);
}

/** A PR is "feature-labelled" when it carries a distinct feature label. Many commits
 *  with no distinct feature label are flagged, not rewarded (PRD §4.7): such PRs are
 *  excluded from the *agentic-depth* reward path but still counted as merged work. */
export function isLabelSpam(pr: PrRow): boolean {
  return pr.isMerged && !pr.hasFeatureLabel;
}

/**
 * Skill invocation counts only if the session produced a draft/shipped output
 * (PRD §4.7). Returns the skills used in a session, or [] when no output was
 * produced (the credit is voided).
 */
export function creditedSkills(session: SessionRow): string[] {
  return session.producedOutput ? session.skillsUsed : [];
}

/**
 * Apply the cross-cutting guards to a member's raw rows, returning a cleaned copy
 * the KPI layer can consume directly:
 *  - excluded (BYO/unmatched) sessions removed;
 *  - label-less merged PRs have their agentic-majority reward stripped (they still
 *    count as merged work, but don't earn agentic-depth credit);
 *  - skill credit on output-less sessions voided.
 *
 * Pure — returns a new object; never mutates the input.
 */
export function applyAntiGaming(rows: MemberRawRows): MemberRawRows {
  const sessions = dropExcludedSessions(rows.sessions).map((s) => ({
    ...s,
    skillsUsed: creditedSkills(s),
  }));

  const prs = rows.prs.map((pr) =>
    isLabelSpam(pr) ? { ...pr, agenticMajority: false } : pr,
  );

  return { ...rows, sessions, prs };
}
