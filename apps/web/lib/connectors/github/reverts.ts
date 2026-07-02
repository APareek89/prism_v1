// lib/connectors/github/reverts.ts
//
// Revert detection (Effectiveness signal, PRD §4 / gh_prs.reverted_at). A merged PR is
// "reverted" when a later merged PR/commit within 14 DAYS undoes it. Two detection
// methods, both deterministic:
//   1. title/body markers: GitHub's auto-revert PRs are titled `Revert "<original>"`
//      and reference the reverted PR number ("Reverts #123" / "This reverts commit
//      <sha>"). We parse the original PR number / merge sha from a candidate revert.
//   2. the parsed revert is matched to the original by (repo, number) or (repo, sha).
//
// The PURE core (parseRevertTarget / isWithin14d / detectReverts) takes plain data; the
// DB write (markReverted) is a thin admin-client upsert of `reverted_at`. Self-reverts
// (same author reverting their own PR) are still recorded — the scoring layer decides
// whether to exclude them (anti-gaming), not the connector.

import { adminDb } from './db';

const REVERT_WINDOW_MS = 14 * 86_400_000;

/** A merged PR candidate considered for revert detection. */
export interface RevertCandidate {
  number: number;
  title: string | null;
  body?: string | null;
  /** merge commit sha (the original PR's merge_sha, or a revert PR's own). */
  mergeSha: string | null;
  mergedAt: string | null;
}

/** What a revert PR points at (parsed from its title/body). */
export interface RevertTarget {
  /** the original PR number this revert undoes, if referenced. */
  prNumber: number | null;
  /** the original merge sha this revert undoes, if referenced. */
  sha: string | null;
}

/**
 * Parse a candidate's title/body for what it reverts. Recognizes:
 *   • `Revert "..."` / `Reverts #123` / `Revert PR #123`  → prNumber
 *   • `This reverts commit <40-hex>`                       → sha
 * Returns {null,null} when the candidate is not a revert.
 */
export function parseRevertTarget(candidate: RevertCandidate): RevertTarget {
  const title = candidate.title ?? '';
  const body = candidate.body ?? '';
  const text = `${title}\n${body}`;

  const isRevert = /\brevert(s|ed|ing)?\b/i.test(title) || /\breverts?\b/i.test(body);
  if (!isRevert) return { prNumber: null, sha: null };

  let prNumber: number | null = null;
  const prRef = text.match(/\brevert(?:s|ed)?\b[^#\n]{0,40}#(\d+)/i) ?? text.match(/#(\d+)/);
  if (prRef && prRef[1]) prNumber = Number.parseInt(prRef[1], 10);

  let sha: string | null = null;
  const shaRef = text.match(/this reverts commit\s+([0-9a-f]{7,40})/i);
  if (shaRef && shaRef[1]) sha = shaRef[1];

  return { prNumber, sha };
}

/** True when `revertedAt` falls within 14 days AFTER `mergedAt` (both ISO). */
export function isWithin14d(mergedAt: string | null, revertedAt: string | null): boolean {
  if (!mergedAt || !revertedAt) return false;
  const m = Date.parse(mergedAt);
  const r = Date.parse(revertedAt);
  if (Number.isNaN(m) || Number.isNaN(r)) return false;
  const delta = r - m;
  return delta >= 0 && delta <= REVERT_WINDOW_MS;
}

/** One detected revert: original PR number → the revert's merged-at timestamp. */
export interface DetectedRevert {
  originalPrNumber: number | null;
  originalSha: string | null;
  revertedAt: string;
}

/**
 * PURE: scan a set of merged PRs, find the ones that revert an earlier PR within 14d,
 * and return the (original → reverted_at) facts. `originals` indexes the PRs that could
 * be reverted (by number and by sha) so a candidate's reference resolves to a real PR
 * and its merge timestamp gates the 14-day window.
 */
export function detectReverts(
  candidates: ReadonlyArray<RevertCandidate>,
): DetectedRevert[] {
  const byNumber = new Map<number, RevertCandidate>();
  const bySha = new Map<string, RevertCandidate>();
  for (const c of candidates) {
    byNumber.set(c.number, c);
    if (c.mergeSha) bySha.set(c.mergeSha, c);
  }

  const out: DetectedRevert[] = [];
  for (const c of candidates) {
    if (!c.mergedAt) continue;
    const target = parseRevertTarget(c);
    if (target.prNumber === null && target.sha === null) continue;

    const original =
      (target.prNumber !== null ? byNumber.get(target.prNumber) : undefined) ??
      (target.sha ? bySha.get(target.sha) : undefined);
    if (!original || original.number === c.number) continue;
    if (!isWithin14d(original.mergedAt, c.mergedAt)) continue;

    out.push({
      originalPrNumber: original.number,
      originalSha: original.mergeSha,
      revertedAt: c.mergedAt,
    });
  }
  return out;
}

/**
 * Persist a detected revert: set gh_prs.reverted_at for the original PR (by repo+number).
 * Idempotent — only writes when reverted_at differs. Returns true when a row was updated.
 */
export async function markReverted(
  repo: string,
  prNumber: number,
  revertedAt: string,
): Promise<boolean> {
  try {
    const { error } = await adminDb()
      .from('gh_prs')
      .update({ reverted_at: revertedAt })
      .eq('repo', repo)
      .eq('number', prNumber);
    return !error;
  } catch {
    return false;
  }
}
