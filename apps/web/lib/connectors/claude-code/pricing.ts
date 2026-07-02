// lib/connectors/claude-code/pricing.ts
//
// Per-model $/MTok table for Anthropic models, used to DERIVE cc_sessions.cost_usd
// when a session's .jsonl carries usage tokens but no cost (the local-file path
// never records a price — Landmine #1). Pure: no I/O, no clock.
//
// Pricing is the standard public Anthropic API rate card expressed in USD per
// MILLION tokens (MTok). Cache-READ is billed at ~10% of the input rate; cache
// WRITE (cache_creation) at ~125% of input (5-minute TTL). Output is the highest
// tier. We map a raw `message.model` id to a tier by substring so new point
// releases (opus-4-6, opus-4-7, opus-4-8, fable-5, …) resolve without edits.

/** $/MTok for one model tier. cacheRead/cacheWrite are the cached-input lanes. */
export interface ModelRate {
  /** fresh (uncached) input tokens. */
  input: number;
  /** output tokens. */
  output: number;
  /** cache-READ (hit) tokens — ~10% of input. */
  cacheRead: number;
  /** cache-WRITE (creation, 5m TTL) tokens — ~125% of input. */
  cacheWrite: number;
}

/** Coarse Anthropic model tiers — what actually drives the rate card. */
export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'unknown';

/**
 * Rate card in $/MTok (millions of tokens). Public Anthropic API pricing.
 *   opus   : $15 in / $75 out  (cacheRead $1.50, cacheWrite $18.75)
 *   sonnet : $3  in / $15 out  (cacheRead $0.30, cacheWrite $3.75)
 *   haiku  : $0.80 in / $4 out (cacheRead $0.08, cacheWrite $1.00)
 * `unknown` falls back to sonnet-class so an unrecognized model still yields a
 * sane (non-zero, non-NaN) cost rather than throwing.
 */
export const RATE_CARD: Record<ModelTier, ModelRate> = {
  opus: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  haiku: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1.0 },
  // Fallback tier mirrors sonnet (mid-tier) so cost is plausible, never 0/NaN.
  unknown: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

/** One million — the MTok denominator. */
const MTOK = 1_000_000;

/**
 * Resolve a raw `message.model` string to a coarse tier. Tolerates undefined /
 * empty / synthetic ids. Anthropic ids look like `claude-opus-4-8`,
 * `claude-3-5-sonnet-20241022`, `claude-haiku-4`, `claude-fable-5` (a sonnet-class
 * codename), etc. Substring match keeps this future-proof.
 */
export function modelTier(model: string | null | undefined): ModelTier {
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  // `<synthetic>` and other placeholder rows have no real cost.
  if (m.includes('synthetic')) return 'unknown';
  if (m.includes('opus')) return 'opus';
  if (m.includes('haiku')) return 'haiku';
  // `fable` is a sonnet-class research codename; treat as sonnet.
  if (m.includes('sonnet') || m.includes('fable')) return 'sonnet';
  return 'unknown';
}

/** Look up the $/MTok rate for a raw model id. Never throws. */
export function rateFor(model: string | null | undefined): ModelRate {
  return RATE_CARD[modelTier(model)];
}

/** Token counts that drive a cost computation (all default 0 when absent). */
export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreation: number;
}

/**
 * Derive USD cost for one model's token usage. `tokensIn` is treated as the
 * FRESH (uncached) input lane; cacheRead and cacheCreation are billed on their
 * own lanes so the cost lens reflects real cache savings. Returns a non-negative
 * number rounded to 4 dp (matching cc_sessions.cost_usd numeric(12,4)). Pure.
 */
export function deriveCostUsd(model: string | null | undefined, usage: TokenUsage): number {
  const r = rateFor(model);
  const inTok = Math.max(0, usage.tokensIn || 0);
  const outTok = Math.max(0, usage.tokensOut || 0);
  const crTok = Math.max(0, usage.cacheRead || 0);
  const ccTok = Math.max(0, usage.cacheCreation || 0);
  const cost =
    (inTok * r.input + outTok * r.output + crTok * r.cacheRead + ccTok * r.cacheWrite) / MTOK;
  // Round to 4 decimals (DB precision); guard against -0 / NaN.
  const rounded = Math.round(cost * 1e4) / 1e4;
  return Number.isFinite(rounded) && rounded > 0 ? rounded : 0;
}
