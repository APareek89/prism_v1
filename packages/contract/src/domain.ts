// @prism/contract — shared domain vocabulary for the v3 model.
// Hand-curated enums/ids that mirror docs/scoring-model.md (v3.0) and the model lab
// (prism-model-lab/public/content.js). DB row types live in db.generated.ts, generated
// from the live v3 schema by scripts/generate.mjs.

/** Core-6 (main index) + Harness-4 + diagnostic KPI ids. */
export type KpiId =
  // MAIN index — Core-6
  | 'ai_share' // KPI 1
  | 'cadence' // KPI 3
  | 'iterations' // KPI 4
  | 'tokens' // KPI 6
  | 'revert' // KPI 7
  | 'rework' // KPI 10
  // HARNESS index
  | 'skills_authored' // KPI 12
  | 'verification' // KPI 13
  | 'review_loop' // KPI 14
  | 'continuity' // KPI 15
  // Diagnostic (tier-badged, not in the core until promoted)
  | 'reliability'; // KPI 9

export const MAIN_KPI_IDS = [
  'ai_share',
  'cadence',
  'iterations',
  'tokens',
  'revert',
  'rework',
] as const satisfies readonly KpiId[];

export const HARNESS_KPI_IDS = [
  'skills_authored',
  'verification',
  'review_loop',
  'continuity',
] as const satisfies readonly KpiId[];

/** Which index a KPI belongs to. Diagnostic KPIs are scored but never weighted. */
export type KpiIndexKind = 'main' | 'harness' | 'diagnostic';

/** The two published indexes. */
export type IndexKind = 'main' | 'harness';

/** MAIN-index dimensions (harness KPIs all live in the 'harness' pseudo-dimension). */
export type Dimension = 'usage' | 'efficiency' | 'outcomes' | 'harness';

/** v3.0 default dimension weights for the MAIN index (Usage 15 · Efficiency 35 · Outcomes 50). */
export const DEFAULT_DIMENSION_WEIGHTS: Record<'usage' | 'efficiency' | 'outcomes', number> = {
  usage: 15,
  efficiency: 35,
  outcomes: 50,
};

/** Insight/recommendation delivery channel (lab channel legend). */
export type Channel = 'fix' | 'nudge' | 'rec' | 'team' | 'org';

/** Main-index bands. The Harness index has NO bands — a plain 0–100. */
export type Band = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export const BAND_LABELS: Record<Band, string> = {
  L0: 'L0 · Dormant',
  L1: 'L1 · Basic',
  L2: 'L2 · Productive',
  L3: 'L3 · Workflow',
  L4: 'L4 · Power',
  L5: 'L5 · Multiplier',
};

/** Band floors (score ≥ min → band), evaluated top-down. L0 is gate-forced or score 0. */
export const BAND_FLOORS: ReadonlyArray<{ min: number; band: Band }> = [
  { min: 85, band: 'L5' },
  { min: 70, band: 'L4' },
  { min: 55, band: 'L3' },
  { min: 35, band: 'L2' },
  { min: 1, band: 'L1' },
  { min: 0, band: 'L0' },
];

/** L0 gate: AI-assisted share below this % forces L0 · Dormant on the main index. */
export const L0_GATE_AI_SHARE_PCT = 15;

/** Confidence publish floor: below this, the index is suppressed as "Insufficient". */
export const CONFIDENCE_PUBLISH_FLOOR = 0.4;

/** AI→PR link methods, strongest first, with stored confidence. */
export type LinkMethod = 'pr_link' | 'sha' | 'branch' | 'coauthor';

export const LINK_CONFIDENCE: Record<LinkMethod, number> = {
  pr_link: 0.99,
  sha: 0.95,
  branch: 0.8,
  coauthor: 0.6,
};

/** Coaching (Addendum B). */
export type CoachingRuleId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';
export type Intervention = 'enrich' | 'coach' | 'flag' | 'block';
export type CoachingOutcome = 'acted' | 'ignored' | 'dismissed';

/** Data-point fetchability tags (data catalog). */
export type FetchTag = 'now' | 'setup' | 'est' | 'no';

/** KPI 9 evidence-ladder tiers. Tier badge is displayed on every number. */
export type ReliabilityTier = 'T1' | 'T2' | 'T3' | 'T4';

/** KPI 10 fix/rework evidence ladder, strongest first. */
export type ReworkEvidenceTier = 'issue_link' | 'fix_type' | 'pattern';

/** KPI 13 harness categories (V5 counted in KPI 14). */
export type HarnessCategory = 'V1' | 'V2' | 'V3' | 'V4' | 'V5';

/** Rows a user writes from the Growth tab (management-facing adoption evidence). */
export type UserContextKind = 'course_completed' | 'adopted' | 'confirmed';

/** PR size classes (KPI 4 fairness: big PRs judged against big PRs). */
export type SizeBucket = 'S' | 'M' | 'L';

/** The 10 seeded developer archetypes (services/ingest/scripts/seed.mjs). */
export type Archetype =
  | 'star_with_harness'
  | 'no_harness_shipper'
  | 'cold_starter'
  | 'greenfield_only'
  | 'over_generator'
  | 'burst_user'
  | 'context_hand_carrier'
  | 'quota_capped'
  | 'review_skipper'
  | 'steady_median';

/** Per-KPI weights for one index; each enabled set must sum to 100. */
export type KpiWeights = Partial<Record<KpiId, number>>;

/** Shape of v3.config_versions.config_jsonb. */
export interface IndexConfig {
  /** Per-KPI weight (0–100) within its index; main and harness each sum to 100 over ENABLED KPIs. */
  weights: KpiWeights;
  /** KPIs the user disabled ("deleted") in Configure. */
  disabled: KpiId[];
}
