// lib/recommendations/types.ts
//
// Deterministic recommendations vocabulary (M4 · A2). A recommendation is emitted by a
// PURE rule function over the SAME raw/kpi evidence the scoring engine consumes — never
// the LLM (agents narrate the rationale separately; here we store the rule's own text).
//
// DETERMINISM BOUNDARY (M4 hard rule): every NUMBER in a rec — the before/after/delta in
// evidence_jsonb — is computed in CODE from real rows. The engine never fabricates data:
// a rule returns null (no rec) when the denominator is missing.
//
// A rule reads a RuleContext (one employee's window evidence + persisted KPI norms) and
// returns zero-or-one RuleOutput. The engine dedupes, stamps function/employee/date, and
// persists via the service-role client.

import type { Dimension } from '@/lib/scoring/types';

/** The recommendation kind (mirrors the rec_kind enum: skill | process | course). */
export type RecKind = 'skill' | 'process' | 'course';

/** Before/after/delta evidence for a rec. Every value is computed in code from real rows.
 *  `unit` documents the metric so the read layer / agents can render it honestly. */
export interface RecEvidence {
  /** the metric this rec is grounded on (e.g. "suggestion_acceptance_rate"). */
  metric: string;
  /** the observed "before" value (current window). null when no signal. */
  before: number | null;
  /** the anchor/target "after" the rec aims for. null when not a target-based rec. */
  after: number | null;
  /** after − before (the modeled gap the rec closes). null when either side is null. */
  delta: number | null;
  /** unit label for before/after ("rate" 0–1, "count", "share", "usd", …). */
  unit: string;
  /** the raw observation count backing `before` (0 → no signal). */
  signals: number;
}

/** One rule's output for one employee. `ref` is the stable key inside a (kind) family —
 *  it de-dupes to one OPEN rec per (employee, kind, ref). `detected_via` records the rule. */
export interface RuleOutput {
  kind: RecKind;
  /** skill name / process id / course id — the stable per-kind identity. */
  ref: string;
  /** the deterministic, rule-authored rationale sentence (no LLM). */
  rationale: string;
  /** which rule produced this (also the adoption re-verify key). */
  detectedVia: string;
  /** the dimension this rec targets (drives the read-layer tag indirectly via kind). */
  dimension: Dimension;
  /** before/after/delta — all computed in code. */
  evidence: RecEvidence;
}

/** One persisted KPI norm for an employee (from kpi_daily, written by the scoring engine).
 *  Rules read these rather than recomputing — they narrate the engine's outputs. */
export interface KpiPoint {
  kpiId: string;
  /** raw_value from kpi_daily (the un-normalized metric, e.g. an acceptance rate 0–1). */
  raw: number | null;
  /** norm_score from kpi_daily (0–100 against frozen anchors). */
  norm: number | null;
  /** stored confidence band for the row. */
  confidence: string | null;
}

/** A merged-PR fact for the window (subset of gh_prs used by the size/revert rules). */
export interface PrFact {
  id: string;
  isMerged: boolean;
  sizeBucket: 'S' | 'M' | 'L' | null;
  aiAssisted: boolean;
  reverted: boolean;
}

/** A session fact for the window (subset of cc_sessions used by skill/cache rules). */
export interface SessionFact {
  id: string;
  turns: number;
  tokensIn: number;
  cacheRead: number;
  skillsUsed: string[];
  linkedPrId: string | null;
}

/** A course-completion fact (from courses) used by the course adoption predicate. */
export interface CourseFact {
  courseId: string;
  dimension: string | null;
  knowledgeCheckPassed: boolean;
}

/** Everything a rule (and the adoption monitor) sees for ONE employee for ONE run window.
 *  Assembled once by the engine/monitor from the raw + computed tables (service-role). */
export interface RuleContext {
  functionId: string;
  employeeId: string;
  /** run date (YYYY-MM-DD) — passed in, never a clock. */
  date: string;
  /** persisted employee-scope KPI norms, indexed by kpi_id. */
  kpis: Record<string, KpiPoint>;
  /** persisted employee-scope L2 dimension scores (0–100) from index_daily; null when
   *  the dimension had no signal. Read by the course-nudge rule to pick the weakest. */
  l2: Record<Dimension, number | null>;
  /** merged/observed PRs in the 28d window. */
  prs: PrFact[];
  /** CC sessions in the 28d window. */
  sessions: SessionFact[];
  /** distinct skill/agent files authored by this employee (from proficiency signals). */
  authoredSkills: string[];
  /** assigned courses + completion state (for the course adoption predicate). */
  courses: CourseFact[];
}

/** A pure rule: RuleContext → zero-or-one RuleOutput. Never touches the DB or a clock. */
export type Rule = (ctx: RuleContext) => RuleOutput | null;

/** A rule with its stable id (the detected_via value it stamps). */
export interface RegisteredRule {
  id: string;
  run: Rule;
}
