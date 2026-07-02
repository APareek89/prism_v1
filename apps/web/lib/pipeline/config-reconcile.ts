// lib/pipeline/config-reconcile.ts
//
// Translate a stored `index_config` row (weights_jsonb / anchors_jsonb / sizing_jsonb
// + numeric version) into the scoring `RawIndexConfig` shape `resolveScoringConfig`
// consumes. PURE (no I/O) so it is trivially unit-testable and deterministic.
//
// WHY THIS EXISTS (verified against migration 0021 + the live DB row):
//   • anchors_jsonb uses NON-canonical KPI keys and carries an extra `inverted`
//     field the strict scoring anchorSchema (.strict()) REJECTS. We map the keys to
//     canonical KpiIds and DROP `inverted` (the scoring engine derives direction from
//     constants.INVERTED_KPIS, not from config).
//   • sizing_jsonb is DB-shaped ({ weights:{files,hunks,modules,blast}, thresholds:
//     {s_max,m_max}, tie_break_pct }) — NOT the scoring SizingConfig shape
//     ({ modulesWeight, blastWeight, coldStart:{sMax,lMin}, tieBreakBand }). We map it.
//   • weights_jsonb already matches the scoring weights shape.
//
// CONTRACT: never throw. Any field that is absent/invalid falls back to the canonical
// default for that field so a malformed or partial stored config still resolves
// (resolveScoringConfig then re-validates the assembled RawIndexConfig with zod).

import type { KpiId } from '@/lib/scoring/types';
import type { RawIndexConfig } from '@/lib/scoring/config';
import { DEFAULT_INDEX_CONFIG } from '@/lib/scoring/defaults/index-config.default';

/** Stored anchor key (anchors_jsonb) → canonical scoring KpiId. Keys that already
 *  match a KpiId (e.g. ai_assisted_pr_share) map to themselves; the five that differ
 *  are listed explicitly. Derived from the 0021 seed vs constants.KPI_DIMENSION. */
const ANCHOR_KEY_TO_KPI: Record<string, KpiId> = {
  // identical keys
  ai_assisted_pr_share: 'ai_assisted_pr_share',
  agentic_depth_share: 'agentic_depth_share',
  tool_session_cadence: 'tool_session_cadence',
  tokens_to_shipped: 'tokens_to_shipped',
  change_failure_rate: 'change_failure_rate',
  defect_rework_rate: 'defect_rework_rate',
  distinct_skills_authored: 'distinct_skills_authored',
  multiplier_signal: 'multiplier_signal',
  // differing keys (stored → canonical)
  iterations_to_merge: 'ai_iterations_to_merge',
  suggestion_acceptance: 'suggestion_acceptance_rate',
  merged_without_revert: 'merged_without_revert_rate',
  ai_retention_30d: 'ai_code_retention_30d',
  skill_file_leverage: 'effective_skill_leverage',
};

interface RawAnchor {
  floor?: unknown;
  target?: unknown;
  ceil?: unknown;
  // `inverted` intentionally ignored (scoring derives direction from constants).
}

function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Map stored anchors_jsonb → the scoring anchors record (canonical KpiId keys,
 * { floor?, target, ceil? } only). Anchors with an unknown key, a non-finite target,
 * or a shape that would fail direction validation are DROPPED so scoring merges the
 * canonical default for that KPI instead of throwing. Returns undefined when nothing
 * usable was found (→ scoring uses all defaults).
 */
export function reconcileAnchors(
  anchorsJsonb: unknown,
): Partial<Record<KpiId, { floor?: number; target: number; ceil?: number }>> | undefined {
  if (!anchorsJsonb || typeof anchorsJsonb !== 'object') return undefined;
  const out: Partial<Record<KpiId, { floor?: number; target: number; ceil?: number }>> = {};
  let found = false;

  for (const [storedKey, rawVal] of Object.entries(anchorsJsonb as Record<string, unknown>)) {
    const kpiId = ANCHOR_KEY_TO_KPI[storedKey];
    if (!kpiId) continue; // unknown key → skip (default applies)
    if (!rawVal || typeof rawVal !== 'object') continue;
    const a = rawVal as RawAnchor;
    const target = numOrUndef(a.target);
    if (target === undefined) continue; // target is required by anchorSchema
    const floor = numOrUndef(a.floor);
    const ceil = numOrUndef(a.ceil);

    const anchor: { floor?: number; target: number; ceil?: number } = { target };
    if (floor !== undefined) anchor.floor = floor;
    if (ceil !== undefined) anchor.ceil = ceil;
    out[kpiId] = anchor;
    found = true;
  }

  return found ? out : undefined;
}

/**
 * Map stored sizing_jsonb → the scoring SizingConfig-shaped RawIndexConfig.sizing.
 * DB shape:  { weights:{files,hunks,modules,blast}, thresholds:{s_max,m_max},
 *              tie_break_pct }
 * Scoring:   { modulesWeight, blastWeight, coldStart:{sMax,lMin}, tieBreakBand }
 * Any missing/invalid field falls back to the canonical default field. coldStart is
 * only taken from stored thresholds when sMax < lMin (the schema invariant); otherwise
 * the default cutoffs are kept so resolveScoringConfig never rejects them.
 */
export function reconcileSizing(sizingJsonb: unknown): RawIndexConfig['sizing'] {
  const d = DEFAULT_INDEX_CONFIG.sizing;
  const s = (sizingJsonb && typeof sizingJsonb === 'object' ? sizingJsonb : {}) as Record<
    string,
    unknown
  >;
  const weights = (s.weights && typeof s.weights === 'object' ? s.weights : {}) as Record<
    string,
    unknown
  >;
  const thresholds = (s.thresholds && typeof s.thresholds === 'object' ? s.thresholds : {}) as Record<
    string,
    unknown
  >;

  const modulesWeight = numOrUndef(weights.modules) ?? d.modulesWeight;
  const blastWeight = numOrUndef(weights.blast) ?? d.blastWeight;
  const tieBreakBand = numOrUndef(s.tie_break_pct) ?? d.tieBreakBand;

  // thresholds: s_max → coldStart.sMax, m_max → coldStart.lMin (M is 7..m_max, L > m_max).
  const sMax = numOrUndef(thresholds.s_max);
  const lMin = numOrUndef(thresholds.m_max);
  const coldStart =
    sMax !== undefined && lMin !== undefined && sMax < lMin
      ? { sMax, lMin }
      : { ...d.coldStart };

  return {
    modulesWeight: modulesWeight >= 0 ? modulesWeight : d.modulesWeight,
    blastWeight: blastWeight >= 0 ? blastWeight : d.blastWeight,
    coldStart,
    tieBreakBand: tieBreakBand >= 0 && tieBreakBand <= 1 ? tieBreakBand : d.tieBreakBand,
  };
}

/** Stored index_config row columns this reconciler reads. */
export interface StoredIndexConfigRow {
  version?: unknown;
  weights_jsonb?: unknown;
  anchors_jsonb?: unknown;
  sizing_jsonb?: unknown;
}

/**
 * Translate a stored index_config row into a scoring RawIndexConfig. Uses stored
 * weights (falling back to default per-field, then to the whole default set if the
 * sum isn't ~1), stored anchors (key-mapped, `inverted` dropped), and stored sizing
 * (shape-mapped). Stamps the stored version as `v<version>` so every computed row
 * records the real config_version. NEVER throws.
 */
export function reconcileStoredConfig(row: StoredIndexConfigRow): RawIndexConfig {
  const dw = DEFAULT_INDEX_CONFIG.weights;
  const w = (row.weights_jsonb && typeof row.weights_jsonb === 'object'
    ? row.weights_jsonb
    : {}) as Record<string, unknown>;

  const weights = {
    usage: numOrUndef(w.usage) ?? dw.usage,
    efficiency: numOrUndef(w.efficiency) ?? dw.efficiency,
    effectiveness: numOrUndef(w.effectiveness) ?? dw.effectiveness,
    proficiency: numOrUndef(w.proficiency) ?? dw.proficiency,
  };
  const sum = weights.usage + weights.efficiency + weights.effectiveness + weights.proficiency;
  const safeWeights = Math.abs(sum - 1) <= 1e-6 ? weights : { ...dw };

  const versionNum = numOrUndef(row.version);
  const configVersion = `v${versionNum && versionNum > 0 ? versionNum : 1}`;

  const raw: RawIndexConfig = {
    configVersion,
    weights: safeWeights,
    sizing: reconcileSizing(row.sizing_jsonb),
  };

  const anchors = reconcileAnchors(row.anchors_jsonb);
  if (anchors) raw.anchors = anchors;

  return raw;
}
