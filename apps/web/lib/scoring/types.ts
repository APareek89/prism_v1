// lib/scoring/types.ts
//
// Self-contained vocabulary for the deterministic scoring engine. This file (and
// constants.ts) hold ALL scoring types/enums — nothing here imports from
// lib/types or anywhere outside lib/scoring. The app's shared lib/types may
// re-declare structurally-compatible copies, but the engine never depends on them.
//
// Determinism contract: every value below is a plain data shape. No clock, no I/O.
// The run date is always an explicit parameter on the entry points (see window.ts,
// compute-daily.ts), never read from `Date.now()`.

// ---------------------------------------------------------------------------
// Core enums
// ---------------------------------------------------------------------------

/** The unit of accountability a score is computed at. PRs are an *input* (prLevel),
 *  never a scope (architecture §0.2). */
export type Scope = 'function' | 'team' | 'employee';

/** Deterministic PR size bucket (PRD §4.3). Size only *groups* like-with-like;
 *  it is never rewarded. */
export type SizeBucket = 'S' | 'M' | 'L';

/** The four L2 sub-indexes the L1 "white light" refracts into (PRD §4.1). */
export type Dimension = 'usage' | 'efficiency' | 'effectiveness' | 'proficiency';

/** L0–L5 banding (PRD §4.5). */
export type Band = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** Confidence band (PRD §4.6). */
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'insufficient';

/** Stable identifiers for each of the 12 KPIs (PRD §4.2). */
export type KpiId =
  // Usage / AI-depth
  | 'ai_assisted_pr_share'
  | 'agentic_depth_share'
  | 'tool_session_cadence'
  // Efficiency
  | 'ai_iterations_to_merge'
  | 'suggestion_acceptance_rate'
  | 'tokens_to_shipped'
  // Effectiveness
  | 'merged_without_revert_rate'
  | 'ai_code_retention_30d'
  | 'change_failure_rate'
  | 'defect_rework_rate'
  // Proficiency
  | 'effective_skill_leverage'
  | 'distinct_skills_authored'
  | 'multiplier_signal';

// ---------------------------------------------------------------------------
// Config shapes (typed view of index_config jsonb — see config.ts)
// ---------------------------------------------------------------------------

/** Two frozen anchors per KPI (PRD §4.4). `floor`/`target` for higher-is-better;
 *  `target`/`ceil` for inverted (lower-is-better) KPIs. We keep all three optional
 *  so a single typed shape covers both directions; config.ts validates the pair
 *  that each direction requires. */
export interface KpiAnchor {
  /** higher-is-better: value at/below this normalizes to 0. */
  floor?: number;
  /** the "good" point — value at/beyond this caps at 100 (cap-at-target rule). */
  target: number;
  /** inverted only: value at/above this normalizes to 0. */
  ceil?: number;
}

/** L2 dimension weights that sum to 1.0 (PRD §4.1). */
export interface DimensionWeights {
  usage: number;
  efficiency: number;
  effectiveness: number;
  proficiency: number;
}

/** Sizing rule knobs (PRD §4.3). */
export interface SizingConfig {
  /** size_score weights: files + hunks + modulesWeight·modules + blastWeight·blast. */
  modulesWeight: number;
  blastWeight: number;
  /** Cold-start S/M/L cutoffs used until 90-day tertiles are frozen. */
  coldStart: { sMax: number; lMin: number };
  /** ± fraction of a boundary inside which an LLM tie-break *may* be requested. */
  tieBreakBand: number;
}

/** The fully-typed, validated scoring config. `config_version` is stamped onto
 *  every computed row so a score always records the config it used (PRD §4.7). */
export interface ScoringConfig {
  configVersion: string;
  weights: DimensionWeights;
  /** Per-KPI normalization anchors. */
  anchors: Record<KpiId, KpiAnchor>;
  sizing: SizingConfig;
  /** Min signal counts per dimension for a dimension to "qualify" toward confidence. */
  minSignals: Record<Dimension, number>;
  /** Winsorization percentiles for normalization input cleaning. */
  winsor: { lower: number; upper: number };
}

// ---------------------------------------------------------------------------
// Raw input rows (what a member contributes for one run-window)
// ---------------------------------------------------------------------------

/** One merged/observed PR with the deterministic diff signals the GitHub connector
 *  computes on ingest (PRD §4.3, §6 gh_prs). `size_score`/`size_bucket` are
 *  *re-derived here* by sizing.ts — the connector's raw size_score is advisory. */
export interface PrRow {
  prId: string;
  /** changed files after ignore_globs cleaning. */
  files: number;
  /** contiguous diff blocks. */
  hunks: number;
  /** distinct top-level dirs/packages touched. */
  modules: number;
  /** 1 if any path matches sensitive_globs (auth/billing/core/infra/db), else 0. */
  blast: 0 | 1;
  isMerged: boolean;
  /** true when a confirmed AI→PR link exists (pr_ai_link). Drives AI-rate inclusion. */
  aiLinked: boolean;
  /** reverted within 14d of merge. */
  revertedWithin14d: boolean;
  /** AI-authored lines in this PR (for retention denominator). */
  aiLinesMerged: number;
  /** of aiLinesMerged, how many are still alive at 30d (blame). */
  aiLinesAliveAt30d: number;
  /** >=50% of accepted hunks are AI-originated. */
  agenticMajority: boolean;
  /** a fix-type follow-up commit touched the same hunks within 14d. */
  defectReworkWithin14d: boolean;
  /** this is a self-revert (excluded from effectiveness, anti-gaming). */
  isSelfRevert: boolean;
  /** distinct feature label present (many commits, no feature → flagged not rewarded). */
  hasFeatureLabel: boolean;
}

/** One Claude Code session (PRD §6 cc_sessions). */
export interface SessionRow {
  sessionId: string;
  /** the PR this session is linked to (if any). */
  linkedPrId: string | null;
  /** day-key (e.g. "2026-06-12") this session occurred on; used for active-day counts. */
  day: string;
  /** assistant turns in the session (iteration proxy). */
  turns: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreation: number;
  suggestionsOffered: number;
  suggestionsAccepted: number;
  /** distinct skill.md names invoked in this session. */
  skillsUsed: string[];
  /** true only if the session produced a draft/shipped output (skill-credit gate). */
  producedOutput: boolean;
  /** session belongs to a BYO/unmatched/missing-stream attribution → excluded from AI rates. */
  excludedFromAiRates: boolean;
}

/** A deploy outcome (PRD §6 deploys). AI-assisted deploys feed change-failure. */
export interface DeployRow {
  deployId: string;
  aiAssisted: boolean;
  changeFailed: boolean;
}

/** A skill/agent.md authorship + reuse fact (Proficiency). */
export interface SkillAuthorshipRow {
  /** the authored skill file name. */
  skillName: string;
  /** count of *other* engineers who used this authored skill (multiplier signal). */
  usedByOthersCount: number;
}

/** Working-days context for the window (cadence denominator). */
export interface MemberMeta {
  memberId: string;
  /** working days in the compute window (denominator for cadence). */
  workingDays: number;
}

/** Everything one member contributes for one run-window. */
export interface MemberRawRows {
  meta: MemberMeta;
  prs: PrRow[];
  sessions: SessionRow[];
  deploys: DeployRow[];
  skills: SkillAuthorshipRow[];
}

// ---------------------------------------------------------------------------
// KPI / normalization / index result shapes
// ---------------------------------------------------------------------------

/** A raw KPI computation: the value plus a `signals` count that feeds confidence.
 *  `value` is null when there is no denominator (no fabricated numbers). */
export interface KpiRaw {
  kpiId: KpiId;
  dimension: Dimension;
  value: number | null;
  /** number of underlying observations (e.g. merged PRs, sessions) — drives confidence. */
  signals: number;
}

/** A normalized KPI: 0–100 against frozen anchors, with the inputs that produced it. */
export interface KpiNormalized extends KpiRaw {
  /** 0–100, or null when value is null. */
  norm: number | null;
  /** the anchor pair used (for transparency / agent grounding). */
  anchor: KpiAnchor;
  inverted: boolean;
}

/** L2 sub-index for one dimension. */
export interface L2Result {
  dimension: Dimension;
  /** 0–100 weighted mean of the dimension's normalized KPIs; null if no signal. */
  score: number | null;
  /** total signals across the dimension's KPIs. */
  signals: number;
  /** whether this dimension met its min-signal threshold (qualifies for confidence). */
  metMinSignal: boolean;
  kpis: KpiNormalized[];
}

/** The token cost-lens (PRD §9.2.1) — reported standalone for FinOps. */
export interface TokensPerPr {
  /** total tokens (in+out) ÷ merged PRs; null if no merged PRs. */
  tokensPerPr: number | null;
  /** cacheRead ÷ total input tokens — higher = less waste. */
  cacheReadShare: number | null;
  /** compaction signal: cacheCreation ÷ tokensIn (context being pruned/re-pinned). */
  compactionSignal: number | null;
  mergedPrs: number;
}

/** Confidence result (PRD §4.6). */
export interface ConfidenceResult {
  /** sum of qualifying L2 weights, 0–1. */
  score: number;
  band: ConfidenceBand;
  /** true when score < 0.40 → suppress L1, show partials. */
  shouldSuppressL1: boolean;
  /** the small-cohort (N<8) one-band drop was applied. */
  cohortPenaltyApplied: boolean;
}

/** A full per-member (or per-scope) index result, ready to map onto index_daily. */
export interface IndexResult {
  scope: Scope;
  scopeId: string;
  /** run date (YYYY-MM-DD), passed in — never derived from a clock. */
  date: string;
  configVersion: string;
  /** 0–100; null when confidence suppresses L1. */
  l1: number | null;
  l2: Record<Dimension, L2Result>;
  band: Band;
  confidence: ConfidenceResult;
  tokensPerPr: TokensPerPr;
  /** AI-active share (linked AI PRs ÷ merged PRs) — drives the L0 gate. */
  aiActiveShare: number | null;
  /** total multiplier signal (skills authored, used by >=1 other) — gates L5. */
  multiplierSignal: number;
}

// ---------------------------------------------------------------------------
// Persistence-ready payloads (compute-daily output)
// ---------------------------------------------------------------------------

/** One row destined for kpi_daily. */
export interface KpiDailyRow {
  date: string;
  scope: Scope;
  scopeId: string;
  kpiId: KpiId;
  rawValue: number | null;
  normScore: number | null;
  /** underlying observation count for this KPI → persisted as kpi_daily.signal_count.
   *  The agent read layer uses it as the min-signal gate (metMinSignal = count > 0). */
  signalCount: number;
  /** dimension confidence carried for the row (PRD §6 kpi_daily.confidence). */
  confidence: number;
}

/** One row destined for index_daily. */
export interface IndexDailyRow {
  date: string;
  scope: Scope;
  scopeId: string;
  l1: number | null;
  l2Usage: number | null;
  l2Eff: number | null;
  l2Effness: number | null;
  l2Prof: number | null;
  band: Band;
  confidence: number;
  confidenceBand: ConfidenceBand;
  tokensPerPr: number | null;
  configVersion: string;
}

/** The function-scope aggregate: an IndexResult plus the secondary mean and the
 *  member count (N) the median was taken over (PRD §4.7). Lives here (not in
 *  aggregate.ts) so ComputeDailyResult can reference it without a circular import. */
export interface FunctionAggregate extends IndexResult {
  /** secondary: mean of member L1s (PRD §4.7 "mean shown secondary"). */
  l1Mean: number | null;
  /** the member count this aggregate covers (N). */
  memberCount: number;
}

/** The complete ready-to-persist payload compute-daily returns. The caller persists;
 *  this engine stays pure. */
export interface ComputeDailyResult {
  kpiDaily: KpiDailyRow[];
  indexDaily: IndexDailyRow[];
  /** the per-member IndexResults (richer than the flat rows) for agents/UI. */
  members: IndexResult[];
  /** the aggregated function-scope result (median over members). */
  function: FunctionAggregate;
}
