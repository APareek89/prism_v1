// Engine input/output shapes. Raw rows come straight from v3.* tables
// (@prism/contract row types); outputs mirror the computed tables.

import type {
  AiPrLinkRow, Band, Channel, CoachingRuleId, CommitRow, ConfigVersionRow,
  DeployEventRow, DeveloperRow, IndexKind, KpiCatalogRow, KpiId, KpiIndexKind,
  LinkMethod, PrRow, ReliabilityTier, RepoRow, SessionRow, SkillRow,
} from '@prism/contract';

/** Everything the pure engine needs — no IO, no clock, no randomness. */
export interface RawData {
  developers: DeveloperRow[];
  repos: RepoRow[];
  prs: PrRow[];
  commits: CommitRow[];
  sessions: SessionRow[];
  skills: SkillRow[];
  deployEvents: DeployEventRow[];
}

export interface EngineConfig {
  catalog: KpiCatalogRow[];
  configVersion: ConfigVersionRow;
}

export interface ComputedLink {
  session_id: string;
  repo: string;
  pr_number: number;
  developer_id: string;
  method: LinkMethod;
  confidence: number;
  suppressed: boolean;
}

export interface KpiResult {
  kpi_id: KpiId;
  index_kind: KpiIndexKind;
  raw_value: number | null;   // null = honest no-signal, never 0-by-default
  score: number | null;
  signal_count: number;
  tier: ReliabilityTier | null;
  meta: Record<string, unknown>;
}

export interface IndexResult {
  index_kind: IndexKind;
  score: number | null;       // null when confidence is below the publish floor
  band: Band | null;          // main only; harness has no bands
  confidence: number;
  gates: { l0_forced: boolean; l5_capped: boolean; multiplier_signal: number };
  dimensions: Partial<Record<'usage' | 'efficiency' | 'outcomes', number | null>>;
}

export interface InsightResult {
  kpi_id: string;             // KpiId or 'linkage'
  hypothesis: string;         // 'H0'..'H4' | 'LINK'
  title: string;
  body: string;
  magnitude: Record<string, unknown>;
  evidence: Record<string, unknown>;
  channel: Channel;
}

export interface RecommendationResult {
  ref: string;
  title: string;
  rationale: string;
  channel: Channel;
  owner: string;
  targets: KpiId[];
  impact: number;
  rank: number;
}

export interface DeveloperComputation {
  developer_id: string;
  kpis: KpiResult[];
  indexes: IndexResult[];
  insights: InsightResult[];
  recommendations: RecommendationResult[];
}

export interface ComputeResult {
  /** The as-of date (YYYY-MM-DD) derived from the data itself — deterministic. */
  date: string;
  windowStart: string;        // ISO — 28 days before asOf (inclusive)
  links: ComputedLink[];
  perDeveloper: DeveloperComputation[];
}

/** A coaching rule id is referenced in recommendation rationales. */
export type { CoachingRuleId };
