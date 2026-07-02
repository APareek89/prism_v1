// ─────────────────────────────────────────────────────────────────────────────
// M1 read-model DTOs — the typed contract between the data layer (lib/db) and the
// view components. Member-count-agnostic: the same DTOs describe 1 or N members.
// Numbers are produced by the scoring engine / pipeline; the UI only renders them.
// EVERYTHING here is nullable where "no data yet" is possible — an empty/awaiting-
// signal state is the default until index_daily has rows (no fabricated values).
// ─────────────────────────────────────────────────────────────────────────────
import type { Dimension } from '@/app/tokens';
import type { Period } from '@/lib/config/constants';

export type { Dimension, Period };
export type ScopeKind = 'function' | 'team' | 'employee';

/** CSS/tag suffix used by the HTML design (.tag2.eff etc.) and member L2 keys. */
export type DimensionTag = 'usage' | 'eff' | 'effness' | 'prof';
export const DIMENSION_TAG: Record<Dimension, DimensionTag> = {
  usage: 'usage',
  efficiency: 'eff',
  effectiveness: 'effness',
  proficiency: 'prof',
};

export type ConfidenceBandName = 'High' | 'Medium' | 'Low' | 'Insufficient';
export type BandLabel = string; // e.g. "L3 · Workflow"
export type DeltaDir = 'up' | 'down' | 'flat';

export interface DeltaDTO {
  dir: DeltaDir;
  /** display string already formatted, e.g. "+2", "−1", "―". */
  label: string;
}

/** Context strip above each view. */
export interface MetaDTO {
  scopeLabel: string; // "Core Platform" / a member name / "My view"
  periodLabel: string; // "Mon 30 Jun" / "Wk 26 · 2026" / "Jun 2026"
  windowLabel: string; // "trailing 28d rolling"
  prsInWindow: number | null;
  confidence: ConfidenceBandName;
  confidencePct: number; // 0–100 for the little bar
  updatedAtLabel: string | null;
}

/** One L2 sub-index bar in the spectrum. */
export interface L2DTO {
  dimension: Dimension;
  tag: DimensionTag;
  label: string; // "Efficiency"
  weightPct: number; // 25
  score: number | null; // 0–100, null when below min-signal
  delta: DeltaDTO | null;
  vsSquad: number | null; // squad avg for My view / member detail
  minSignalMet: boolean;
}

/** The L1 hero. */
export interface IndexDTO {
  l1: number | null; // null ⇒ suppressed (render EmptyState)
  band: BandLabel | null;
  bandBlurb: string | null; // "AI lives inside recurring workflows; outputs ship."
  delta: DeltaDTO | null;
  confidence: ConfidenceBandName;
  suppressed: boolean; // confidence < 0.40
  spectrum: L2DTO[]; // the four L2s
}

/** Function-only cost lens. */
export interface TokenStatsDTO {
  tokensPerPrLabel: string | null; // "48.2k"
  deltaLabel: string | null; // "▼ 11% vs last week"
  costPerPrLabel: string | null; // "≈ $0.34 / PR"
  targetLabel: string | null; // "↓ target < 42k"
  series: number[]; // bar trend; [] ⇒ awaiting-signal
}

/** Inline-SVG trend series. */
export interface TrendDTO {
  series: number[]; // [] ⇒ empty-axes awaiting state
  granularityLabel: string; // "last 28 days"
  hue?: string;
}

/** "Top 5 to improve" item (narrative from the agent, impact computed in code). */
export interface ImprovementDTO {
  rank: number;
  title: string;
  body: string;
  dimension: Dimension;
  tag: DimensionTag | 'cost';
  impactLabel: string; // "+5 Proficiency" / "−15% tokens"
}

/** "What moved the index" driver. */
export interface DriverDTO {
  dir: 'up' | 'down';
  title: string; // "Efficiency +4"
  body: string;
  amountLabel: string; // "+4.0" / "good" / "watch"
  amountDir: 'up' | 'down';
}

/** A roster row (Team view). */
export interface MemberRowDTO {
  id: string;
  name: string;
  role: string;
  you: boolean;
  l1: number | null;
  l2: { usage: number | null; eff: number | null; effness: number | null; prof: number | null };
  tokensPerPrLabel: string; // "39.1k" / "—"
  d7: DeltaDTO | null;
}

/** "What's going well — and why" (member detail / My view). */
export interface WellItemDTO {
  category: 'prompt' | 'skill' | 'waste' | 'qual';
  title: string;
  cause: string; // may contain an emphasized fragment, rendered as <em>
}

/** A communication/nudge sent to a member. */
export interface CommsEntryDTO {
  dateLabel: string; // "Jun 26"
  channel: string; // "email + slack"
  action: string;
  status: 'adopted' | 'prog' | 'ack' | 'dismiss' | 'course';
  statusLabel: string; // "adopted" / "in progress" / "course · 40%"
}

/** A PR-level coaching insight (My view). */
export interface PrInsightDTO {
  prNumber: string; // "#421"
  flag: 'clean' | 're-prompt' | 'revert' | 'ai-slop';
  flagTone: 'ok' | 'warn' | 'bad';
  title: string;
  sizeBucket: 'S' | 'M' | 'L';
  summary: string;
  suggestion: string | null; // "→ try api-client.skill.md"
  tag: DimensionTag;
  tagLabel: string; // "clean" / "re-prompt" / "revert"
}

/** A recommendation with adoption status (My view). */
export interface RecommendationDTO {
  title: string;
  body: string;
  kind: 'skill' | 'process' | 'course';
  tag: DimensionTag;
  marker: string; // "✦" etc.
}

/** The assigned course card. */
export interface CourseDTO {
  title: string;
  url: string;
  progressPct: number;
  statusLabel: string; // "40% · knowledge check pending · due in 5 days"
  knowledgeCheckPending: boolean;
}

/** Admin connector card. */
export interface ConnectorCardDTO {
  type: 'github' | 'claude_code' | 'sentry';
  name: string;
  connected: boolean;
  statusLabel: string; // "Connected" / "Not configured"
  powers: string;
  syncLabel: string | null;
}

/** Admin roster row with match status. */
export interface RosterMatchDTO {
  name: string;
  designation: string;
  githubHandle: string | null;
  email: string | null;
  claudeUuidMasked: string | null;
  match: 'linked' | 'byo' | 'unmatched';
  you: boolean;
}

/** Admin index-config + sizing display (read-only/versioned). */
export interface IndexConfigRowDTO {
  dimension: Dimension;
  tag: DimensionTag;
  label: string;
  weightPct: number;
  anchorLabel: string; // "turns: 12 → 3 (inverted)"
}
export interface SizingRuleDTO {
  formula: string; // "files + hunks + 2·modules + 3·blast"
  thresholds: string[]; // ["S ≤ p33", "M p33–p66", "L > p66"]
  frozen: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data read-API contract (implemented in lib/db by the data agent; consumed by
// the view RSCs). All return safe empty/awaiting-signal shapes when there is no
// data. Signatures are the authoritative names the view agents import.
//
//   getMeta(scope, scopeId, period): Promise<MetaDTO>
//   getIndex(scope, scopeId, period): Promise<IndexDTO>
//   getTrend(scope, scopeId, period): Promise<TrendDTO>
//   getTokenStats(period): Promise<TokenStatsDTO>            // function scope only
//   getImprovements(scope, scopeId): Promise<ImprovementDTO[]>
//   getDrivers(scope, scopeId, period): Promise<DriverDTO[]>
//   getRoster(functionId): Promise<MemberRowDTO[]>
//   getMember(memberId): Promise<{ row: MemberRowDTO; meta: MetaDTO } | null>
//   getMemberWell(memberId): Promise<WellItemDTO[]>
//   getMemberComms(memberId): Promise<CommsEntryDTO[]>
//   getMyView(employeeId): Promise<{ index: IndexDTO; meta: MetaDTO }>
//   getPrInsights(employeeId): Promise<PrInsightDTO[]>
//   getRecommendations(employeeId): Promise<RecommendationDTO[]>
//   getCourse(employeeId): Promise<CourseDTO | null>
//   getConnectors(functionId): Promise<ConnectorCardDTO[]>
//   getRosterMatches(functionId): Promise<RosterMatchDTO[]>
//   getIndexConfig(functionId): Promise<IndexConfigRowDTO[]>
//   getSizingRule(functionId): Promise<SizingRuleDTO>
// ─────────────────────────────────────────────────────────────────────────────
