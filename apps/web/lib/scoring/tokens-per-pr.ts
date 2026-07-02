// lib/scoring/tokens-per-pr.ts
//
// The token cost-lens (PRD §9.2.1, §12.1). Reported standalone for FinOps and fed
// into the attribution/TokenLens surfaces. Pure; null when no merged PRs.
//
//   tokensPerPr      = total tokens (in+out) ÷ merged PRs
//   cacheReadShare   = cacheRead ÷ total input-side tokens (tokensIn + cacheRead +
//                      cacheCreation) — higher = cheaper re-sent context (less waste)
//   compactionSignal = cacheCreation ÷ tokensIn — context being pruned / re-pinned

import type { MemberRawRows, TokensPerPr } from './types';
import { safeDiv, sum } from './math';

export function computeTokensPerPr(rows: MemberRawRows): TokensPerPr {
  const mergedPrs = rows.prs.filter((p) => p.isMerged).length;

  const tokensIn = sum(rows.sessions.map((s) => s.tokensIn));
  const tokensOut = sum(rows.sessions.map((s) => s.tokensOut));
  const cacheRead = sum(rows.sessions.map((s) => s.cacheRead));
  const cacheCreation = sum(rows.sessions.map((s) => s.cacheCreation));

  const totalTokens = tokensIn + tokensOut;
  // Input-side total for the cache-read share: fresh input + cached read + cache write.
  const inputSide = tokensIn + cacheRead + cacheCreation;

  return {
    tokensPerPr: safeDiv(totalTokens, mergedPrs),
    cacheReadShare: safeDiv(cacheRead, inputSide),
    compactionSignal: safeDiv(cacheCreation, tokensIn),
    mergedPrs,
  };
}
