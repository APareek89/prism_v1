// lib/agents/grounding.ts
//
// The GROUNDING GATE — the enforcement half of the determinism boundary
// (architecture §0.3). After a node produces narrative, this checks two things:
//
//   1. NUMBER GROUNDING: every number the model quoted in its prose must appear in the
//      deterministic inputs it was given (the allowed-number set). A quoted figure that
//      isn't in the inputs is a hallucinated statistic → the item is rejected.
//   2. EVIDENCE GROUNDING: every id in `evidenceRefs` must exist in the provided
//      evidence set. A dangling ref means the model cited something that isn't there →
//      rejected.
//
// Policy: the caller gets ONE repair retry (re-run the node with a corrective note);
// if the repaired item still fails, it is DROPPED (never persisted). This module is
// pure (no I/O) so it is fully unit-testable — the retry loop lives in the nodes.

import type { EvidenceRow } from '@/lib/types/agents';

// ---------------------------------------------------------------------------
// The allowed-number set
// ---------------------------------------------------------------------------

/**
 * Collect every numeric token that the model is allowed to quote, from the deterministic
 * inputs: the evidence values plus any explicit "allowed" numbers the node passes
 * (e.g. the L1/L2 scores, anchor targets, deltas it rendered into the prompt).
 *
 * Numbers are normalized to a canonical string so "40", "40.0", and "+40" compare equal.
 */
export function buildAllowedNumbers(
  evidence: EvidenceRow[],
  extra: ReadonlyArray<number | null | undefined> = [],
): Set<string> {
  const set = new Set<string>();
  for (const e of evidence) {
    for (const n of extractNumbers(String(e.value))) set.add(n);
    // an id like "kpi:ai_assisted_pr_share" carries no number; labels might.
    for (const n of extractNumbers(e.label)) set.add(n);
  }
  for (const v of extra) {
    if (v !== null && v !== undefined && Number.isFinite(v)) set.add(canonical(v));
  }
  return set;
}

/**
 * Extract candidate numeric tokens from a string. Pulls integers and decimals,
 * ignoring the sign and a trailing `%`/`k` unit so "−15%" and "15" both canonicalize to
 * "15". Years-in-dates inside ISO strings are intentionally still extracted (harmless —
 * they'll be in the allowed set too since dates appear on both sides).
 */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  // Match a number with optional decimal part. We strip surrounding sign/units after.
  const re = /\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(canonical(Number(m[0])));
  }
  return out;
}

/** Canonical form for number comparison: drop trailing zeros, no sign. */
export function canonical(n: number): string {
  const abs = Math.abs(n);
  // Round to 4 decimals to avoid float noise, then strip trailing zeros.
  const s = abs.toFixed(4).replace(/\.?0+$/, '');
  return s;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export interface GroundingViolation {
  kind: 'ungrounded_number' | 'dangling_evidence';
  detail: string;
}

export interface GroundingResult {
  ok: boolean;
  violations: GroundingViolation[];
}

/**
 * Validate one narrative item's prose + evidenceRefs against the allowed numbers and the
 * evidence id set. Returns every violation found (so a repair prompt can be specific).
 */
export function checkGrounding(
  prose: string[],
  evidenceRefs: string[],
  allowedNumbers: Set<string>,
  evidenceIds: Set<string>,
): GroundingResult {
  const violations: GroundingViolation[] = [];

  // 1. Number grounding: every number in the prose must be in the allowed set.
  const joined = prose.join(' ');
  for (const tok of extractNumbers(joined)) {
    if (!allowedNumbers.has(tok)) {
      violations.push({
        kind: 'ungrounded_number',
        detail: `quoted number "${tok}" is not present in the provided inputs`,
      });
    }
  }

  // 2. Evidence grounding: every ref must resolve to a provided evidence id.
  for (const ref of evidenceRefs) {
    if (!evidenceIds.has(ref)) {
      violations.push({
        kind: 'dangling_evidence',
        detail: `evidenceRef "${ref}" does not match any provided evidence id`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Build the id set from an evidence list (helper for callers). */
export function evidenceIdSet(evidence: EvidenceRow[]): Set<string> {
  return new Set(evidence.map((e) => e.id));
}

/** A compact corrective note appended to the prompt on the single repair retry. */
export function repairNote(violations: GroundingViolation[]): string {
  const nums = violations.filter((v) => v.kind === 'ungrounded_number').map((v) => v.detail);
  const refs = violations.filter((v) => v.kind === 'dangling_evidence').map((v) => v.detail);
  const parts: string[] = [
    'Your previous answer was rejected by the grounding gate. Fix these and return again:',
  ];
  if (nums.length) {
    parts.push(
      `- Remove or correct these ungrounded numbers (only quote figures present in the inputs): ${nums.join(
        '; ',
      )}.`,
    );
  }
  if (refs.length) {
    parts.push(`- Remove these evidence ids that do not exist: ${refs.join('; ')}.`);
  }
  return parts.join('\n');
}
