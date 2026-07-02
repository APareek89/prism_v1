// lib/agents/nodes/pr-classify.ts
//
// The DETERMINISTIC PR verdict — the classification half of the pr-level flow. Per the
// determinism boundary (architecture §0.3), the verdict CLASS is decided here in code
// from real signals; the LLM only writes the reason + fix sentences. This function is
// pure (no I/O, no clock) and is unit-tested exhaustively (pr-classify.test.ts).
//
// Precedence (first match wins), most-severe first:
//   1. revert   — reverted within 14d of merge and NOT a self-revert (a real failure).
//   2. ai_slop  — AI-majority change that needed fix-type rework within 14d (shipped soft).
//   3. re_prompt— many AI iterations to reach merge (a prompting loop worth tightening).
//   4. clean    — none of the above (healthy AI-assisted PR).
//
// Notes:
//   • a self-revert is excluded from the `revert` verdict (anti-gaming: the author
//     caught it themselves — see scoring anti-gaming), and is NOT slop; it lands as
//     re_prompt if it iterated, else clean.
//   • the iteration threshold is a fixed, documented cutoff (not model-decided).

import type { PrVerdict } from '@/lib/types/agents';

/** The deterministic signals the verdict is a pure function of. */
export interface PrClassifierInput {
  aiLinked: boolean;
  isMerged: boolean;
  revertedWithin14d: boolean;
  isSelfRevert: boolean;
  agenticMajority: boolean;
  defectReworkWithin14d: boolean;
  aiIterations: number;
  sizeBucket: 'S' | 'M' | 'L';
}

/** AI iterations at/above this on a single PR flags a re-prompt loop (documented cutoff). */
export const REPROMPT_ITERATION_THRESHOLD = 8;

/**
 * Classify a PR into exactly one verdict. Deterministic and total (always returns a
 * verdict). Unmerged PRs are treated as `clean` here (they aren't a delivered outcome to
 * grade); callers that only pass merged PRs never hit that branch.
 */
export function classifyPr(input: PrClassifierInput): PrVerdict {
  // A reverted-within-14d merge that the author did NOT self-revert is a real failure.
  if (input.isMerged && input.revertedWithin14d && !input.isSelfRevert) {
    return 'revert';
  }
  // AI-majority change that needed fix-type rework shortly after merge → slop.
  if (input.isMerged && input.agenticMajority && input.defectReworkWithin14d) {
    return 'ai_slop';
  }
  // Many AI iterations to reach merge → a re-prompt loop.
  if (input.aiIterations >= REPROMPT_ITERATION_THRESHOLD) {
    return 're_prompt';
  }
  return 'clean';
}
