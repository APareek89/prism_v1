// lib/types/db.ts
//
// Hand-authored TypeScript row types mirroring the Supabase schema (PRD §6 /
// architecture §3 migrations 0001–0021). These describe the shapes the app reads
// and writes; the canonical SQL lives in supabase/migrations and the *generated*
// types live in database.generated.ts (regenerated via `npm run db:types`).
//
// SHARED ENUMS are defined ONCE here (Band, ConfidenceBand, SizeBucket, Dimension,
// AttributionMode, KpiId, plus scope_kind and the connector/rec/course enums) and
// re-exported by the @/lib/types barrel. The scoring engine deliberately keeps its
// OWN structurally-compatible copy for M0 independence (ownership-map) — these are
// NOT imported from lib/scoring.

import type { AttributionMode } from './attribution-mode';

export type { AttributionMode };

// ---------------------------------------------------------------------------
// Shared enums (single source of truth for the app layer)
// ---------------------------------------------------------------------------

/** The unit of accountability a score is computed at (DB `scope_kind`). A PR is a
 *  prLevel *input*, never a scope. */
export type Scope = 'function' | 'team' | 'employee';

/** L0–L5 banding (PRD §4.5). */
export type Band = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** Confidence band (PRD §4.6). */
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'insufficient';

/** Deterministic PR size bucket (PRD §4.3) — groups like-with-like, never rewarded. */
export type SizeBucket = 'S' | 'M' | 'L';

/** The four L2 sub-indexes (PRD §4.1). */
export type Dimension = 'usage' | 'efficiency' | 'effectiveness' | 'proficiency';

/** Stable identifiers for the 12 KPIs (PRD §4.2). */
export type KpiId =
  | 'ai_assisted_pr_share'
  | 'agentic_depth_share'
  | 'tool_session_cadence'
  | 'ai_iterations_to_merge'
  | 'suggestion_acceptance_rate'
  | 'tokens_to_shipped'
  | 'merged_without_revert_rate'
  | 'ai_code_retention_30d'
  | 'change_failure_rate'
  | 'defect_rework_rate'
  | 'effective_skill_leverage'
  | 'distinct_skills_authored'
  | 'multiplier_signal';

/** Application roles (DB `app_role`, PRD §12.5). */
export type AppRole = 'developer' | 'manager' | 'function_lead' | 'admin';

/** Connector kinds (DB `connector_type`). */
export type ConnectorType = 'github' | 'claude_code' | 'sentry';

/** Connector health surfaced in Admin chrome. */
export type ConnectorStatus = 'not_configured' | 'connected' | 'syncing' | 'error';

/** Versioned index band labels stored on rows (DB `index_band` == Band). */
export type IndexBand = Band;

/** Recommendation kind (DB `rec_kind`). */
export type RecKind =
  | 'skill_reuse'
  | 'skill_author'
  | 'size_discipline'
  | 'acceptance_rate'
  | 'cache_efficiency'
  | 'revert_rate'
  | 'course_nudge';

/** Recommendation lifecycle (DB `rec_status`, PRD §10.4). */
export type RecStatus = 'suggested' | 'acknowledged' | 'in_progress' | 'adopted' | 'dismissed';

/** Course assignment lifecycle (DB `course_status`). */
export type CourseStatus = 'assigned' | 'in_progress' | 'completed';

/** Communication channel (DB `comms_channel`). */
export type CommsChannel = 'email';

// ---------------------------------------------------------------------------
// Common column conventions
// ---------------------------------------------------------------------------

/** ISO timestamp string (Postgres timestamptz). */
export type Timestamp = string;
/** ISO date string `YYYY-MM-DD` (Postgres date). */
export type DateString = string;
/** UUID string. */
export type Uuid = string;

interface Timestamped {
  created_at: Timestamp;
  updated_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Core entity rows (migrations 0003–0006)
// ---------------------------------------------------------------------------

/** functions — the org/function unit. In the demo there is exactly one. */
export interface FunctionRow extends Timestamped {
  id: Uuid;
  name: string;
  slug: string;
}

/** employees — a person in the function. `user_id` links to auth.users (nullable
 *  until they sign in). `is_demo` marks the bootstrap demo employee. */
export interface EmployeeRow extends Timestamped {
  id: Uuid;
  function_id: Uuid;
  user_id: Uuid | null;
  name: string;
  designation: string | null;
  email: string | null;
  github_handle: string | null;
  /** Claude Code account uuid (nullable — the OTEL/BYO path leaves it null). */
  claude_account_uuid: string | null;
  attribution_mode: AttributionMode;
  /** onboarding status, set by provisioning. */
  match_status: 'linked' | 'byo' | 'unmatched';
  is_demo: boolean;
  active: boolean;
}

/** employee_roles — M2M role grants. */
export interface EmployeeRoleRow {
  employee_id: Uuid;
  role: AppRole;
  granted_at: Timestamp;
}

/** index_config — versioned weights/anchors/sizing (append-only, the only seed). */
export interface IndexConfigRow extends Timestamped {
  id: Uuid;
  function_id: Uuid;
  version: number;
  /** jsonb: DimensionWeights {usage, efficiency, effectiveness, proficiency}. */
  weights_jsonb: Record<Dimension, number>;
  /** jsonb: per-KPI normalization anchors. */
  anchors_jsonb: Record<string, { floor?: number; target: number; ceil?: number; inverted?: boolean }>;
  /** jsonb: sizing knobs (size_score weights + S/M/L tertile thresholds). */
  sizing_jsonb: Record<string, unknown>;
  ignore_globs: string[];
  sensitive_globs: string[];
  /** non-null once frozen → immutable (a change appends a new version). */
  frozen_at: Timestamp | null;
}

/** connectors — per-function connector config + health. */
export interface ConnectorRow extends Timestamped {
  id: Uuid;
  function_id: Uuid;
  type: ConnectorType;
  status: ConnectorStatus;
  /** jsonb: non-secret connector settings (repo name, install id, etc.). */
  config_jsonb: Record<string, unknown>;
  last_sync_at: Timestamp | null;
  last_error: string | null;
}

// ---------------------------------------------------------------------------
// Raw evidence rows (migrations 0007–0010)
// ---------------------------------------------------------------------------

/** gh_prs — one merged/observed PR with deterministic diff signals. */
export interface GhPrRow {
  id: Uuid;
  function_id: Uuid;
  employee_id: Uuid | null;
  repo: string;
  number: number;
  head_ref: string;
  merge_sha: string | null;
  title: string;
  files: number;
  hunks: number;
  modules: number;
  blast: number;
  size_score: number | null;
  size_bucket: SizeBucket | null;
  is_merged: boolean;
  merged_at: Timestamp | null;
  reverted_within_14d: boolean;
  is_self_revert: boolean;
  has_feature_label: boolean;
  created_at: Timestamp;
}

/** gh_commits — commit-level facts (coauthor trailers, etc.). */
export interface GhCommitRow {
  id: Uuid;
  function_id: Uuid;
  pr_id: Uuid | null;
  sha: string;
  author_handle: string | null;
  coauthor_trailers: string[];
  committed_at: Timestamp;
}

/** cc_sessions — one Claude Code session (keyed by sessionId+cwd). */
export interface CcSessionRow {
  id: Uuid;
  function_id: Uuid;
  employee_id: Uuid | null;
  session_id: string;
  cwd: string;
  repo: string | null;
  git_branch: string | null;
  linked_pr_id: Uuid | null;
  day: DateString;
  turns: number;
  tokens_in: number;
  tokens_out: number;
  cache_read: number;
  cache_creation: number;
  cost_usd: number | null;
  model: string | null;
  suggestions_offered: number;
  suggestions_accepted: number;
  skills_used: string[];
  produced_output: boolean;
  /** BYO/unmatched/missing-stream → excluded from AI rates. */
  excluded_from_ai_rates: boolean;
  created_at: Timestamp;
}

/** deploys — release/deploy outcomes (Sentry releases, default-branch merges). */
export interface DeployRow {
  id: Uuid;
  function_id: Uuid;
  sha: string;
  ai_assisted: boolean;
  change_failed: boolean;
  deployed_at: Timestamp;
}

/** incidents — Sentry issues → change-failure / MTTR. */
export interface IncidentRow {
  id: Uuid;
  function_id: Uuid;
  deploy_id: Uuid | null;
  opened_at: Timestamp;
  resolved_at: Timestamp | null;
}

/** blame_snapshots — AI-attributed lines + 30d survival. */
export interface BlameSnapshotRow {
  id: Uuid;
  function_id: Uuid;
  pr_id: Uuid;
  ai_lines_merged: number;
  ai_lines_alive_at_30d: number | null;
  snapshot_at: Timestamp;
}

/** pr_ai_link — correlational AI→PR link (method + confidence; never in the score).
 *  method precedence (strongest first): pr_link > sha > branch > coauthor.
 *  `pr_link` is the first-party Claude Code `pr-link` event (an exact
 *  session→(repo,number) assertion) — see lib/connectors/link/match-keys.ts. */
export interface PrAiLinkRow {
  id: Uuid;
  function_id: Uuid;
  pr_id: Uuid;
  session_id: Uuid | null;
  method: 'pr_link' | 'branch' | 'coauthor' | 'sha';
  confidence: number;
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Computed rows (migration 0011) — composite PK for idempotent recompute
// ---------------------------------------------------------------------------

/** kpi_daily — one normalized KPI value per (date, scope, scope_id, kpi). */
export interface KpiDailyRow {
  date: DateString;
  scope: Scope;
  scope_id: Uuid;
  kpi_id: KpiId;
  function_id: Uuid;
  raw_value: number | null;
  norm_score: number | null;
  /** the confidence_band enum (not a number). */
  confidence: ConfidenceBand;
  signal_count: number;
  config_version: number | null;
  computed_at: Timestamp;
}

/** index_daily — the L1/L2 result per (date, scope, scope_id). */
export interface IndexDailyRow {
  date: DateString;
  scope: Scope;
  scope_id: Uuid;
  function_id: Uuid;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  band: Band | null;
  /** the confidence_band enum (the only confidence column). */
  confidence: ConfidenceBand;
  tokens_per_pr: number | null;
  config_version: number;
  computed_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Insights / recs / courses / comms (migration 0012)
// ---------------------------------------------------------------------------

/** insights — agent-authored narrative (numbers come from scoring, never the LLM). */
export interface InsightRow {
  id: Uuid;
  function_id: Uuid;
  date: DateString;
  scope: Scope;
  scope_id: Uuid;
  kind: 'improvement' | 'change' | 'pr_level' | 'attribution';
  rank: number;
  title: string | null;
  body: string | null;
  dimension: string | null;
  /** est_impact computed in code; the agent only narrates it. */
  est_impact: number | null;
  pr_id: Uuid | null;
  /** jsonb: evidence the narrative is grounded against. */
  evidence_jsonb: Record<string, unknown>;
  created_at: Timestamp;
}

/** recommendations — deterministic rule output. title/body are DERIVED in the
 *  read layer (title=ref, body=rationale); there are no title/body/dimension columns. */
export interface RecommendationRow extends Timestamped {
  id: Uuid;
  function_id: Uuid;
  employee_id: Uuid;
  date: DateString;
  kind: RecKind;
  /** the skill name / process id / course id — the (member, kind, ref) open-rec key. */
  ref: string;
  rationale: string | null;
  status: RecStatus;
  detected_via: string | null;
  /** jsonb: the evidence delta that triggered the rec. */
  evidence_jsonb: Record<string, unknown>;
}

/** courses — assignment + Prism-owned completion (knowledge_check_passed_at). */
export interface CourseRow extends Timestamped {
  id: Uuid;
  function_id: Uuid;
  employee_id: Uuid;
  dimension: string | null;
  /** ALS course id (studio slug). */
  course_id: string;
  title: string | null;
  url: string | null;
  /** the ALS-user↔employee link persisted at assignment. */
  als_user_ref: string | null;
  due_at: Timestamp | null;
  progress_pct: number;
  status: CourseStatus;
  /** non-null only when all lessons' knowledge checks pass (completion signal). */
  knowledge_check_passed_at: Timestamp | null;
}

/** comms_log — digest delivery/open events. */
export interface CommsLogRow {
  id: Uuid;
  function_id: Uuid;
  employee_id: Uuid;
  date: DateString;
  channel: CommsChannel;
  payload_html: string | null;
  sent_at: Timestamp | null;
  opened_at: Timestamp | null;
  created_at: Timestamp;
}

// ---------------------------------------------------------------------------
// Pipeline status (net-new migrations 0030+)
// ---------------------------------------------------------------------------

/** pipeline_runs — one daily run per (date, function_id). */
export interface PipelineRunRow {
  id: Uuid;
  function_id: Uuid;
  date: DateString;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
}

/** pipeline_steps — per-step status for "Run now" live view. */
export interface PipelineStepRow {
  id: Uuid;
  run_id: Uuid;
  step: string;
  status: 'pending' | 'running' | 'succeeded' | 'skipped' | 'failed';
  detail: string | null;
  started_at: Timestamp | null;
  finished_at: Timestamp | null;
}
