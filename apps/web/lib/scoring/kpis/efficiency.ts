// lib/scoring/kpis/efficiency.ts
//
// Efficiency KPIs (PRD §4.2). Two are inverted (lower-is-better): iterations and
// tokens. Values are null when there is no denominator.
//
//   ai_iterations_to_merge       = mean(CC turns per merged PR) WITHIN S/M/L          ↓ (inv)
//   suggestion_acceptance_rate   = accepted code-edit suggestions ÷ offered           ↑
//   tokens_to_shipped            = total tokens ÷ merged PRs (cost lens)              ↓ (inv)
//
// "within S/M/L" (PRD §4.3.6, §4.7 anti-gaming): iterations are compared like-with-
// like by size bucket. We compute the per-bucket mean turns-per-merged-PR, then
// average those bucket means so a member who only ships large PRs is not penalized
// vs. one who ships small ones. The bucket of each PR is supplied by the caller
// (sizing.ts) via the prBucket map.

import type {
  KpiRaw,
  MemberRawRows,
  SizeBucket,
} from '../types';
import { mean, safeDiv, sum } from '../math';

/** Map of prId → its frozen size bucket (from sizing.ts). */
export type PrBucketMap = ReadonlyMap<string, SizeBucket>;

/**
 * AI-iterations-to-merge, computed WITHIN size buckets (PRD §4.2/§4.3.6).
 *
 * For each merged PR we sum the turns of its linked CC sessions, bucket by the PR's
 * size, take the mean turns-per-PR inside each bucket, then average the populated
 * bucket means. This keeps comparison within-bucket (anti-gaming) while collapsing
 * to a single member-level raw value the normalizer can anchor.
 *
 * Signals = number of merged PRs that had at least one linked session.
 */
export function aiIterationsToMerge(
  rows: MemberRawRows,
  prBucket: PrBucketMap,
): KpiRaw {
  // turns linked to each merged PR.
  const turnsByPr = new Map<string, number>();
  for (const s of rows.sessions) {
    if (s.linkedPrId === null) continue;
    turnsByPr.set(s.linkedPrId, (turnsByPr.get(s.linkedPrId) ?? 0) + s.turns);
  }

  const perBucket: Record<SizeBucket, number[]> = { S: [], M: [], L: [] };
  let signals = 0;
  for (const pr of rows.prs) {
    if (!pr.isMerged) continue;
    const turns = turnsByPr.get(pr.prId);
    if (turns === undefined) continue; // no linked session → no iteration signal
    const bucket = prBucket.get(pr.prId) ?? 'M'; // default unknown to M (middle)
    perBucket[bucket].push(turns);
    signals += 1;
  }

  // mean turns-per-PR inside each populated bucket, then average those means.
  const bucketMeans: number[] = [];
  for (const bucket of ['S', 'M', 'L'] as const) {
    const m = mean(perBucket[bucket]);
    if (m !== null) bucketMeans.push(m);
  }

  return {
    kpiId: 'ai_iterations_to_merge',
    dimension: 'efficiency',
    value: mean(bucketMeans), // null when no merged PR had a linked session
    signals,
  };
}

/** Suggestion-acceptance rate: accepted code-edit suggestions ÷ offered. */
export function suggestionAcceptanceRate(rows: MemberRawRows): KpiRaw {
  const offered = sum(rows.sessions.map((s) => s.suggestionsOffered));
  const accepted = sum(rows.sessions.map((s) => s.suggestionsAccepted));
  return {
    kpiId: 'suggestion_acceptance_rate',
    dimension: 'efficiency',
    value: safeDiv(accepted, offered),
    // signals = sessions that actually offered at least one suggestion.
    signals: rows.sessions.filter((s) => s.suggestionsOffered > 0).length,
  };
}

/** Tokens-to-shipped: total tokens (in+out) ÷ merged PRs (cost lens). Inverted. */
export function tokensToShipped(rows: MemberRawRows): KpiRaw {
  const mergedPrs = rows.prs.filter((p) => p.isMerged).length;
  const totalTokens = sum(
    rows.sessions.map((s) => s.tokensIn + s.tokensOut),
  );
  return {
    kpiId: 'tokens_to_shipped',
    dimension: 'efficiency',
    value: safeDiv(totalTokens, mergedPrs),
    signals: mergedPrs,
  };
}

/** All Efficiency KPIs for one member. */
export function efficiencyKpis(
  rows: MemberRawRows,
  prBucket: PrBucketMap,
): KpiRaw[] {
  return [
    aiIterationsToMerge(rows, prBucket),
    suggestionAcceptanceRate(rows),
    tokensToShipped(rows),
  ];
}
