// lib/recommendations/rules/cache-efficiency.ts
//
// PROCESS rec — "reuse session context to cut token waste".
//
// Grounding: the cost lens rewards a high cache-read share (cached-input ÷ total input).
// A low share means the member re-sends context that could be cached — burning tokens.
// We compute the window cache-read share directly from cc_sessions (cache_read ÷
// (cache_read + tokens_in)) — a raw signal not otherwise persisted per-employee, so we
// compute it here from real rows (still deterministic, still narrated from real data).
// before = cache-read share, after = the efficiency floor, delta = the gap.

import type { Rule } from '../types';
import { CACHE } from '../thresholds';

const MIN_INPUT_TOKENS = CACHE.minInputTokens;
const CACHE_SHARE_FLOOR = CACHE.floor;

export const cacheEfficiencyRule: Rule = (ctx) => {
  let cacheRead = 0;
  let tokensIn = 0;
  for (const s of ctx.sessions) {
    cacheRead += s.cacheRead;
    tokensIn += s.tokensIn;
  }
  const totalInput = cacheRead + tokensIn;
  if (totalInput < MIN_INPUT_TOKENS) return null; // too little volume to judge

  const share = cacheRead / totalInput;
  if (share >= CACHE_SHARE_FLOOR) return null; // already caching efficiently

  const delta = Number((CACHE_SHARE_FLOOR - share).toFixed(3));
  return {
    kind: 'process',
    ref: 'cache-efficiency',
    rationale:
      `Only ${pct(share)} of your session input tokens came from cache. Keep related work ` +
      `in one session and pin stable context — a higher cache-read share cuts tokens-per-PR.`,
    detectedVia: 'cache-efficiency',
    dimension: 'efficiency',
    evidence: {
      metric: 'cache_read_share',
      before: Number(share.toFixed(3)),
      after: CACHE_SHARE_FLOOR,
      delta,
      unit: 'share',
      signals: ctx.sessions.length,
    },
  };
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
