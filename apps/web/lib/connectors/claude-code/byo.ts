// lib/connectors/claude-code/byo.ts
//
// BYO (Bring-Your-Own telemetry) attribution classifier. A Claude Code session is
// only usable in AI-rate / drop-confidence math when it is bound to a known
// employee. Sessions with no employee binding are "unmatched" and must be EXCLUDED
// from those rates (they would inflate or dilute signals from unknown people).
//
// This module is pure: given parsed sessions + the set of bound session keys, it
// partitions into matched vs unmatched, returns the excluded key set, and emits a
// confidence note describing stream coverage. It does NOT do I/O — session-map.ts
// owns the DB binding and calls this to label the result.

import type { RawSession } from './parser';

/** Separator for the in-memory (sessionId, repo) map key. A control char that
 *  cannot appear in a session uuid or a filesystem path, so the key is unambiguous
 *  even if a repo path contained a space. Defined ONCE here and reused by the
 *  parser + local-sessions merge so every module produces identical keys. */
const KEY_SEP = '\x1f'; // ASCII Unit Separator (US).

/** Build the unique (sessionId, repo) map key. The ONE key constructor — parser.ts,
 *  local-sessions.ts, and byo.ts all call this so keys always match. */
export function makeSessionKey(sessionId: string, repo: string): string {
  return `${sessionId}${KEY_SEP}${repo}`;
}

/** The unique key for a session row: sessionId + repo (mirrors cc_sessions UNIQUE). */
export function sessionKey(s: Pick<RawSession, 'sessionId' | 'repo'>): string {
  return makeSessionKey(s.sessionId, s.repo);
}

export interface ByoClassification {
  /** sessions bound to a known employee — usable for AI rates. */
  matched: RawSession[];
  /** sessions with no employee binding — excluded from AI rates / drop confidence. */
  unmatched: RawSession[];
  /** the (sessionId+repo) keys to mark excludedFromAiRates downstream. */
  excludedKeys: Set<string>;
  /** 0..1 coverage = matched ÷ total (1 when there are no sessions at all). */
  coverage: number;
  /** human-readable confidence note for the connector status / Admin. */
  note: string;
}

/**
 * Classify parsed sessions by whether each is bound to an employee. `boundKeys`
 * is the set of `${sessionId} ${repo}` keys that resolved to a known employee
 * (for the single-person demo, every local session binds to the self employee, so
 * coverage is 100%). Pure — no I/O.
 */
export function classifyByo(
  sessions: readonly RawSession[],
  boundKeys: ReadonlySet<string>,
): ByoClassification {
  const matched: RawSession[] = [];
  const unmatched: RawSession[] = [];
  const excludedKeys = new Set<string>();

  for (const s of sessions) {
    const key = sessionKey(s);
    if (boundKeys.has(key)) {
      matched.push(s);
    } else {
      unmatched.push(s);
      excludedKeys.add(key);
    }
  }

  const total = sessions.length;
  const coverage = total === 0 ? 1 : matched.length / total;

  let note: string;
  if (total === 0) {
    note = 'No Claude Code sessions found — Usage/Efficiency signals will be insufficient.';
  } else if (unmatched.length === 0) {
    note = `All ${total} sessions matched to a known engineer (100% stream coverage).`;
  } else {
    const pct = Math.round(coverage * 100);
    note =
      `${matched.length}/${total} sessions matched (${pct}% coverage); ` +
      `${unmatched.length} unmatched session(s) excluded from AI rates and drop confidence.`;
  }

  return { matched, unmatched, excludedKeys, coverage, note };
}
