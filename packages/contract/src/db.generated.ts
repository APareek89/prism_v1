// GENERATED FILE — do not edit by hand.
// Regenerate with: npm run generate --workspace packages/contract
// Source of truth: the LIVE v3 schema (services/ingest/migrations applied to SUPABASE_DB_URL).
// Generated: from schema v3 (17 tables).
//
// NOTE for consumers using `pg`: register type parsers so bigint/numeric come
// back as JS numbers, e.g.
//   pg.types.setTypeParser(20, Number);    // int8
//   pg.types.setTypeParser(1700, Number);  // numeric

import type {
  Archetype, Band, Channel, CoachingOutcome, CoachingRuleId, Dimension, FetchTag,
  HarnessCategory, IndexConfig, IndexKind, Intervention, KpiId, KpiIndexKind,
  LinkMethod, ReliabilityTier, UserContextKind,
} from './domain';

/** v3.ai_pr_links */
export interface AiPrLinkRow {
  id: string;
  session_id: string;
  repo: string;
  pr_number: number;
  developer_id: string;
  method: LinkMethod;
  confidence: number;
  suppressed: boolean;
  computed_at: string;
}

/** v3.coaching_events */
export interface CoachingEventRow {
  id: string;
  developer_id: string;
  ts: string;
  rule_id: CoachingRuleId;
  gate: string;
  trigger: string;
  intervention: Intervention;
  message: string;
  outcome: CoachingOutcome;
}

/** v3.commits */
export interface CommitRow {
  id: string;
  developer_id: string;
  repo: string;
  sha: string;
  pr_number: number | null;
  message: string;
  authored_at: string;
  co_authored_by_claude: boolean;
  hunk_overlap_pr: number | null;
  linked_issue_kind: 'bug' | 'task' | null;
}

/** v3.config_versions */
export interface ConfigVersionRow {
  version: number;
  created_at: string;
  active: boolean;
  config: IndexConfig;
  note: string;
}

/** v3.data_points */
export interface DataPointRow {
  id: string;
  name: string;
  source: string;
  method: string;
  fetch_tag: FetchTag;
  phase: string;
  powers: string;
}

/** v3.deploy_events */
export interface DeployEventRow {
  id: string;
  repo: string;
  service: string;
  deploy_key: string;
  deployed_at: string;
  status: string;
  kind: 'deploy' | 'rollback' | 'hotfix';
  rollback_of: string | null;
  fix_tagged: boolean;
  merge_shas: string[];
}

/** v3.developers */
export interface DeveloperRow {
  id: string;
  handle: string;
  name: string;
  archetype: Archetype;
  team: string;
  seat_tier: 'standard' | 'capped' | 'none';
  created_at: string;
}

/** v3.index_daily */
export interface IndexDailyRow {
  id: string;
  developer_id: string;
  date: string;
  index_kind: IndexKind;
  score: number | null;
  band: Band | null;
  confidence: number;
  gates: { l0_forced: boolean; l5_capped: boolean; multiplier_signal: number };
  dimensions: Partial<Record<'usage' | 'efficiency' | 'outcomes', number | null>>;
  config_version: number;
  computed_at: string;
}

/** v3.insights */
export interface InsightRow {
  id: string;
  developer_id: string;
  date: string;
  kpi_id: string;
  hypothesis: string;
  title: string;
  body: string;
  magnitude: Record<string, unknown>;
  evidence: Record<string, unknown>;
  channel: Channel;
  config_version: number;
  created_at: string;
}

/** v3.kpi_catalog */
export interface KpiCatalogRow {
  kpi_id: KpiId;
  num: number;
  name: string;
  index_kind: KpiIndexKind;
  dimension: Dimension;
  question: string;
  formula_text: string;
  direction: 'up' | 'down';
  unit: string;
  anchor: { floor?: number; target: number; ceil?: number };
  trust: string;
  status: string;
  data_point_ids: string[];
  enabled_default: boolean;
}

/** v3.kpi_daily */
export interface KpiDailyRow {
  id: string;
  developer_id: string;
  date: string;
  kpi_id: KpiId;
  index_kind: KpiIndexKind;
  raw_value: number | null;
  score: number | null;
  signal_count: number;
  tier: ReliabilityTier | null;
  meta: Record<string, unknown>;
  config_version: number;
  computed_at: string;
}

/** v3.prs */
export interface PrRow {
  id: string;
  developer_id: string;
  repo: string;
  number: number;
  title: string;
  head_ref: string;
  merge_sha: string | null;
  opened_at: string;
  merged_at: string | null;
  files_changed: number;
  hunks: number;
  modules: number;
  blast: boolean;
  module_path: string;
  is_revert: boolean;
  revert_of: number | null;
  labels: string[];
}

/** v3.recommendations */
export interface RecommendationRow {
  id: string;
  developer_id: string;
  date: string;
  ref: string;
  title: string;
  rationale: string;
  channel: Channel;
  owner: string;
  targets: string[];
  impact: number;
  rank: number;
  config_version: number;
  created_at: string;
}

/** v3.repos */
export interface RepoRow {
  repo: string;
  connected: boolean;
  has_build: boolean;
  has_tests: boolean;
  has_lint: boolean;
  has_claude_md: boolean;
  verify_rule_in_claude_md: boolean;
}

/** v3.sessions */
export interface SessionRow {
  id: string;
  developer_id: string;
  session_key: string;
  repo: string | null;
  branch: string | null;
  started_at: string;
  turns: number;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  first_prompt_chars: number;
  context_read_at_start: boolean;
  pr_refs: Array<{ repo: string; number: number }>;
  sha_refs: string[];
  skill_invocations: Array<{ name: string; had_output: boolean }>;
  verification_events: Array<{ category: HarnessCategory; cmd: string; duration_ms: number; exit_code: number }>;
  review_pass: { ran: boolean; diff_changed: boolean; findings: number | null } | null;
}

/** v3.skills */
export interface SkillRow {
  id: string;
  developer_id: string;
  name: string;
  authored_at: string;
  path: string;
}

/** v3.user_context */
export interface UserContextRow {
  id: string;
  developer_id: string;
  kind: UserContextKind;
  ref: string;
  meta: Record<string, unknown>;
  created_at: string;
}

