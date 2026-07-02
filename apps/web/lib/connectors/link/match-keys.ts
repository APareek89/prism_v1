// lib/connectors/link/match-keys.ts
//
// PURE scoring for the AI→PR association (PRD §6, migration 0010 pr_ai_link).
// Given a merged PR and a candidate Claude Code session, decide whether they are the
// same unit of work and with what confidence + method. CORRELATIONAL only — this
// score is NEVER an input to the AI-Native Index; it powers the "this PR was
// AI-assisted" correlational badge.
//
// Four independent signals, strongest wins:
//   • pr_link   — the session emitted a first-party Claude Code `pr-link` event whose
//                 (repository, number) equals this PR's (repo, number). This is a DIRECT
//                 session→PR identity recorded by Claude Code itself when it opened /
//                 pushed the PR — not a heuristic. It is repo-scoped and PR-unique, so it
//                 cannot mis-link. Strongest evidence of all. conf 0.99.
//   • sha       — a session SHA / linked merge_sha overlaps the PR's merge_sha.
//                 Exact commit identity. conf 0.95.
//   • branch    — the session's git branch equals the PR's head_ref. Strong, but a
//                 branch can be reused, so conf 0.80.
//   • coauthor  — a commit on the PR carries a Claude co-author trailer. Indicates AI
//                 authorship but not which session, so conf 0.60.
//
// Precision note (HARD project rule — a wrong link corrupts Effectiveness/Efficiency):
// pr_link/sha/branch are all EXACT-key matches, never fuzzy. coauthor is the only
// weaker signal and it never up-scores past an exact one. There is deliberately NO
// repo+author+time-window heuristic here: it cannot meet the precision bar (two PRs by
// the same author in the same window would both match), so it is excluded by design.
//
// No I/O, no DB — callers assemble candidates and feed them in.

import type { PrAiLinkRow } from '@/lib/types/db';

/** The link method, mirrors pr_ai_link.method ('branch'|'coauthor'|'sha'). */
export type LinkMethod = PrAiLinkRow['method'];

/** Confidence per method (PRD §6). pr_link > sha > branch > coauthor. */
export const METHOD_CONFIDENCE: Record<LinkMethod, number> = {
  pr_link: 0.99,
  sha: 0.95,
  branch: 0.8,
  coauthor: 0.6,
};

/** A scored match between a PR and a session. null fields when no signal fired. */
export interface MatchScore {
  method: LinkMethod | null;
  confidence: number; // 0..1, 0 when no method matched
}

/** A repo-scoped PR identity: (owner/repo, PR number). The exact join key shared by
 *  the PR side (gh_prs.repo + gh_prs.number) and the session side (Claude Code's
 *  `pr-link` event: prRepository + prNumber). */
export interface PrRef {
  /** owner/repo, e.g. "APareek89/prism" (gh_prs.repo / pr-link.prRepository). */
  repo: string | null | undefined;
  /** the PR number (gh_prs.number / pr-link.prNumber). */
  number: number | null | undefined;
}

/** The minimal PR side of a match (the join keys only). */
export interface PrKeys {
  /** this PR's own repo-scoped identity (gh_prs.repo + gh_prs.number). */
  ref?: PrRef;
  /** PR head branch (gh_prs.head_ref). */
  headRef: string | null | undefined;
  /** PR merge commit sha (gh_prs.merge_sha). */
  mergeSha: string | null | undefined;
  /** SHAs of commits on the PR that carry a Claude co-author trailer. */
  coauthorShas?: readonly string[];
}

/** The minimal session side of a match (the join keys only). */
export interface SessionKeys {
  /** PR identities this session explicitly linked to via Claude Code `pr-link`
   *  events (the exact first-party session→PR assertions). */
  prRefs?: readonly PrRef[];
  /** session branch (cc_sessions.branch). */
  branch: string | null | undefined;
  /** SHAs seen/produced in the session (e.g. linked commits), if any. */
  shas?: readonly string[];
  /** whether this session emitted a Claude co-author trailer on a commit. */
  hasCoauthorTrailer?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Lower-case + trim a branch ref for comparison; null/empty → null. */
function normBranch(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const v = ref.trim().toLowerCase();
  return v.length ? v : null;
}

/** Normalize a sha: trim, lower-case. Empty → null. (Prefixes compared separately.) */
function normSha(sha: string | null | undefined): string | null {
  if (!sha) return null;
  const v = sha.trim().toLowerCase();
  return v.length ? v : null;
}

/** Lower-case + trim an owner/repo slug for comparison; null/empty → null. */
function normRepo(repo: string | null | undefined): string | null {
  if (!repo) return null;
  const v = repo.trim().toLowerCase();
  return v.length ? v : null;
}

/** True when two PR refs denote the SAME PR: same owner/repo AND same number. Both
 *  parts must be present — a bare number without a repo (or vice versa) never matches,
 *  so a pr-link can only bind to a PR in its own repository. */
function prRefEq(a: PrRef, b: PrRef): boolean {
  const ar = normRepo(a.repo);
  const br = normRepo(b.repo);
  if (ar === null || br === null || ar !== br) return false;
  if (typeof a.number !== 'number' || typeof b.number !== 'number') return false;
  return a.number === b.number;
}

/** Two SHAs match if one is a prefix of the other (handles short vs full SHAs). */
function shaEq(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 7 && long.startsWith(short);
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual signals
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when the session explicitly linked to THIS PR via a Claude Code `pr-link`
 * event — i.e. one of the session's prRefs equals the PR's own (repo, number). This
 * is the exact first-party identity signal (strongest, repo-scoped, PR-unique).
 */
export function prLinkMatch(prRef: PrKeys['ref'], sessionPrRefs: SessionKeys['prRefs']): boolean {
  if (!prRef || !sessionPrRefs || sessionPrRefs.length === 0) return false;
  for (const sref of sessionPrRefs) {
    if (prRefEq(prRef, sref)) return true;
  }
  return false;
}

/** True when the session branch equals the PR head_ref (case-insensitive). */
export function branchMatch(headRef: PrKeys['headRef'], sessionBranch: SessionKeys['branch']): boolean {
  const a = normBranch(headRef);
  const b = normBranch(sessionBranch);
  return a !== null && b !== null && a === b;
}

/** True when any session SHA overlaps the PR's merge_sha (prefix-aware). */
export function shaOverlap(prMergeSha: PrKeys['mergeSha'], sessionShas: SessionKeys['shas']): boolean {
  const target = normSha(prMergeSha);
  if (!target || !sessionShas || sessionShas.length === 0) return false;
  for (const raw of sessionShas) {
    const s = normSha(raw);
    if (s && shaEq(s, target)) return true;
  }
  return false;
}

/**
 * True when a Claude co-author trailer ties the session to the PR. Either the session
 * is flagged as having emitted one AND the PR carries co-author commits, or one of the
 * session's SHAs is among the PR's co-author commit SHAs.
 */
export function coauthorMatch(pr: PrKeys, session: SessionKeys): boolean {
  const prCoauthorShas = pr.coauthorShas ?? [];
  if (session.shas && prCoauthorShas.length > 0) {
    for (const raw of session.shas) {
      const s = normSha(raw);
      if (!s) continue;
      for (const c of prCoauthorShas) {
        const cs = normSha(c);
        if (cs && shaEq(s, cs)) return true;
      }
    }
  }
  // Fallback: the session emitted a trailer and the PR has co-authored commits.
  return Boolean(session.hasCoauthorTrailer) && prCoauthorShas.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined scorer — strongest method wins
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a (PR, session) pair. Returns the strongest matching method with its fixed
 * confidence, or { method: null, confidence: 0 } when nothing fired. Precedence:
 * pr_link > sha > branch > coauthor.
 */
export function scoreMatch(pr: PrKeys, session: SessionKeys): MatchScore {
  if (prLinkMatch(pr.ref, session.prRefs)) {
    return { method: 'pr_link', confidence: METHOD_CONFIDENCE.pr_link };
  }
  if (shaOverlap(pr.mergeSha, session.shas)) {
    return { method: 'sha', confidence: METHOD_CONFIDENCE.sha };
  }
  if (branchMatch(pr.headRef, session.branch)) {
    return { method: 'branch', confidence: METHOD_CONFIDENCE.branch };
  }
  if (coauthorMatch(pr, session)) {
    return { method: 'coauthor', confidence: METHOD_CONFIDENCE.coauthor };
  }
  return { method: null, confidence: 0 };
}
