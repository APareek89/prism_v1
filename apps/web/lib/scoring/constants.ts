// lib/scoring/constants.ts
//
// All scoring constants/enums live here (self-contained — no imports outside
// lib/scoring). These are the structural facts of the model: which KPI belongs to
// which dimension, which are inverted, the intra-dimension weights, min-signal
// thresholds, winsorize percentiles, cold-start sizing, and the tie-break band.
//
// Editable, versioned values (anchors, dimension weights, sizing cutoffs) live in
// the ScoringConfig (config.ts + defaults/index-config.default.ts). The maps below
// are model structure, not tunables, so they live as code constants.

import type { Dimension, KpiId } from './types';

// ---------------------------------------------------------------------------
// KPI → dimension map (PRD §4.2)
// ---------------------------------------------------------------------------

export const KPI_DIMENSION: Record<KpiId, Dimension> = {
  ai_assisted_pr_share: 'usage',
  agentic_depth_share: 'usage',
  tool_session_cadence: 'usage',

  ai_iterations_to_merge: 'efficiency',
  suggestion_acceptance_rate: 'efficiency',
  tokens_to_shipped: 'efficiency',

  merged_without_revert_rate: 'effectiveness',
  ai_code_retention_30d: 'effectiveness',
  change_failure_rate: 'effectiveness',
  defect_rework_rate: 'effectiveness',

  effective_skill_leverage: 'proficiency',
  distinct_skills_authored: 'proficiency',
  multiplier_signal: 'proficiency',
};

/** The KPIs that make up each dimension, in declaration order. */
export const DIMENSION_KPIS: Record<Dimension, KpiId[]> = {
  usage: ['ai_assisted_pr_share', 'agentic_depth_share', 'tool_session_cadence'],
  efficiency: ['ai_iterations_to_merge', 'suggestion_acceptance_rate', 'tokens_to_shipped'],
  effectiveness: [
    'merged_without_revert_rate',
    'ai_code_retention_30d',
    'change_failure_rate',
    'defect_rework_rate',
  ],
  proficiency: ['effective_skill_leverage', 'distinct_skills_authored', 'multiplier_signal'],
};

// ---------------------------------------------------------------------------
// Inverted KPIs (lower-is-better) — PRD §4.2 "Dir ↓"
// ---------------------------------------------------------------------------

export const INVERTED_KPIS: ReadonlySet<KpiId> = new Set<KpiId>([
  'ai_iterations_to_merge', // mean CC turns per merged PR within S/M/L
  'tokens_to_shipped', // total tokens ÷ merged PRs (cost lens)
  'change_failure_rate', // failed AI deploys ÷ AI deploys
  'defect_rework_rate', // fix follow-up commits ÷ merged PRs
]);

export function isInverted(kpiId: KpiId): boolean {
  return INVERTED_KPIS.has(kpiId);
}

// ---------------------------------------------------------------------------
// Intra-dimension KPI weights (PRD §4.2 — the % in each L2 group). Each group
// sums to 1.0. These are model structure, not admin tunables, so they are code
// constants (the dimension-level weights ARE config; see DimensionWeights).
// ---------------------------------------------------------------------------

export const INTRA_WEIGHTS: Record<KpiId, number> = {
  // Usage / AI-depth
  ai_assisted_pr_share: 0.4,
  agentic_depth_share: 0.35,
  tool_session_cadence: 0.25,
  // Efficiency
  ai_iterations_to_merge: 0.5,
  suggestion_acceptance_rate: 0.3,
  tokens_to_shipped: 0.2,
  // Effectiveness
  merged_without_revert_rate: 0.35,
  ai_code_retention_30d: 0.25,
  change_failure_rate: 0.25,
  defect_rework_rate: 0.15,
  // Proficiency
  effective_skill_leverage: 0.4,
  distinct_skills_authored: 0.25,
  multiplier_signal: 0.35,
};

// ---------------------------------------------------------------------------
// Confidence (PRD §4.6)
// ---------------------------------------------------------------------------

/** Confidence band thresholds. score = Σ qualifying L2 weights (0–1). */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.85, // >= 0.85
  medium: 0.6, // 0.60–0.85
  low: 0.4, // 0.40–0.60
  // < 0.40 → insufficient (suppress L1)
} as const;

/** Below this confidence, L1 is suppressed and only partials are shown. */
export const SUPPRESS_L1_BELOW = 0.4;

/** Cohorts smaller than this drop one confidence band (PRD §4.6, §4.7). */
export const SMALL_COHORT_N = 8;

/** Default minimum-signal thresholds per dimension (PRD §4.6 gives Effectiveness
 *  >=5 outcome-bearing PRs and Proficiency >=10 CC sessions explicitly; Usage and
 *  Efficiency are not pinned by the PRD, so the values below are DEFAULTS we chose
 *  and FLAG: Usage >=3 merged PRs, Efficiency >=5 CC sessions. They are also
 *  exposed via ScoringConfig.minSignals so they remain admin-tunable. */
export const DEFAULT_MIN_SIGNALS: Record<Dimension, number> = {
  usage: 3, // DEFAULT (not pinned by PRD): >=3 merged PRs in window
  efficiency: 5, // DEFAULT (not pinned by PRD): >=5 CC sessions in window
  effectiveness: 5, // PRD: >=5 outcome-bearing PRs
  proficiency: 10, // PRD: >=10 CC sessions
};

// ---------------------------------------------------------------------------
// Normalization (PRD §4.4)
// ---------------------------------------------------------------------------

/** Winsorize at p5/p95 before normalizing (PRD §4.4). */
export const WINSOR = { lower: 0.05, upper: 0.95 } as const;

// ---------------------------------------------------------------------------
// Sizing (PRD §4.3)
// ---------------------------------------------------------------------------

/** size_score = files + hunks + MODULES_WEIGHT·modules + BLAST_WEIGHT·blast. */
export const SIZE_MODULES_WEIGHT = 2;
export const SIZE_BLAST_WEIGHT = 3;

/** Cold-start S/M/L cutoffs until 90-day tertiles are frozen (PRD §4.3):
 *  S <= 6 · M 7–18 · L > 18. */
export const COLD_START_SIZING = { sMax: 6, lMin: 18 } as const;

/** Tertile fractions used to freeze S/M/L cutoffs from trailing-90-day PRs. */
export const SIZE_TERTILES = { p33: 1 / 3, p66: 2 / 3 } as const;

/** A PR within ±this fraction of a size boundary *may* get an LLM tie-break.
 *  The LLM is NEVER primary — needsTieBreak() only flags candidacy (PRD §4.3.5). */
export const SIZE_TIE_BREAK_BAND = 0.1;

// ---------------------------------------------------------------------------
// Banding (PRD §4.5)
// ---------------------------------------------------------------------------

/** L1 numeric band lower bounds (inclusive). L0 is gated separately. */
export const BAND_THRESHOLDS = [
  { band: 'L5' as const, min: 85 },
  { band: 'L4' as const, min: 70 },
  { band: 'L3' as const, min: 55 },
  { band: 'L2' as const, min: 35 },
  { band: 'L1' as const, min: 0 },
];

/** AI-active share below this forces L0 (Dormant). */
export const L0_AI_ACTIVE_GATE = 0.15;

// ---------------------------------------------------------------------------
// Windows (PRD §4.6, §4.3)
// ---------------------------------------------------------------------------

/** Trailing rolling compute window (days). */
export const COMPUTE_WINDOW_DAYS = 28;

/** Trailing sizing-tertile window (days). */
export const SIZING_WINDOW_DAYS = 90;
