// lib/agents/state.ts
//
// The LangGraph channel state for the insight-agent graph. Every NUMBER on this
// state is computed in CODE (assemble.ts, from index_daily/kpi_daily diffs + the
// raw evidence tables) — the LLM nodes only read them and write narrative sentences.
//
// The determinism boundary (architecture §0.3): the reducer channels below carry
//   • the deterministic inputs the LLM narrates over (valuesVsAnchor, deltas,
//     evidence, prRecords, tokensPerPr, computed l1/l2/band/confidence);
//   • the narrative OUTPUTS the nodes append (insights, drivers, prLevel).
// The LLM never writes to an input channel; a grounding gate (grounding.ts) rejects
// any quoted number a node emits that isn't present in these inputs.
//
// Pure data + reducers — no I/O, no clock. The run date is an explicit input.

import { Annotation } from '@langchain/langgraph';
import type { Dimension, Scope, Band, ConfidenceBand } from '@/lib/scoring/types';
import type {
  AgentInsight,
  ChangeDriver,
  PrLevelResult,
  EvidenceRow,
  PrVerdict,
} from '@/lib/types/agents';

// ---------------------------------------------------------------------------
// Deterministic input rows (built in assemble.ts — the numbers live here)
// ---------------------------------------------------------------------------

/**
 * One KPI's normalized value against its frozen anchors, for one scope on the run
 * date. `raw`/`norm` are the scoring engine's own outputs; `floor`/`target` are the
 * anchors it used. `metMinSignal` gates whether the dimension qualifies. Every field
 * is a real computed number (or null when there is no signal) — never fabricated.
 */
export interface ValueVsAnchor {
  kpiId: string;
  dimension: Dimension;
  /** engine raw KPI value (or null when no denominator). */
  raw: number | null;
  /** engine 0–100 normalized score (or null). */
  norm: number | null;
  /** the anchor "floor" the normalization used (higher-is-better) or target (inverted). */
  floor: number;
  /** the anchor "target" (good point). */
  target: number;
  /** the L2 dimension weight this KPI contributes toward (0–1). */
  weight: number;
  /** whether this KPI's dimension met its min-signal threshold. */
  metMinSignal: boolean;
  /** Direct employee fact or privacy-safe aggregate across active employees. */
  provenance?: 'employee' | 'organization_aggregate';
  /** Number of people contributing real KPI evidence (aggregate scopes only). */
  sampleSize?: number;
  /** Active population used as the coverage denominator (aggregate scopes only). */
  populationSize?: number;
}

/**
 * A day-over-period delta the change-governance node narrates. `delta` is the signed
 * change in the metric between the baseline row and the latest row — computed in code.
 */
export interface DeltaRow {
  /** what moved: an L2 dimension name or 'l1'. */
  key: Dimension | 'l1';
  dimension: Dimension | null;
  latest: number | null;
  baseline: number | null;
  /** latest − baseline (null when either side is null). */
  delta: number | null;
  direction: 'up' | 'down' | 'flat';
}

/**
 * A PR record fed to the pr-level graph. The verdict is decided in CODE
 * (nodes/pr-level classifyPr) from these deterministic signals; the LLM only writes
 * the reason + fix sentences. `verdict` is filled by the classifier before the LLM runs.
 */
export interface PrRecord {
  prId: string;
  /** short display ref (e.g. "#421") when known, else the prId. */
  ref: string;
  sizeBucket: 'S' | 'M' | 'L';
  aiLinked: boolean;
  revertedWithin14d: boolean;
  isSelfRevert: boolean;
  agenticMajority: boolean;
  defectReworkWithin14d: boolean;
  /** AI iterations (turns) observed on the linked session(s). */
  aiIterations: number;
  /** merged? (unmerged PRs are excluded from most verdicts). */
  isMerged: boolean;
  /** decided in code before the LLM runs. */
  verdict: PrVerdict;
}

// ---------------------------------------------------------------------------
// The graph state (Annotation.Root)
// ---------------------------------------------------------------------------

/** Replace-on-write reducer (last write wins). Used for scalar inputs. */
function lastValue<T>() {
  return {
    reducer: (_prev: T, next: T): T => next,
    default: (): T => undefined as unknown as T,
  };
}

/** Append reducer for the narrative output channels. */
function appendList<T>() {
  return {
    reducer: (prev: T[], next: T[] | undefined): T[] =>
      next === undefined ? prev : [...prev, ...next],
    default: (): T[] => [],
  };
}

/** Replace-with-default reducer for input arrays (set once by assemble, read by nodes). */
function replaceList<T>() {
  return {
    reducer: (prev: T[], next: T[] | undefined): T[] => (next === undefined ? prev : next),
    default: (): T[] => [],
  };
}

export const InsightState = Annotation.Root({
  // — scope context (deterministic inputs) —
  scope: Annotation<Scope>(lastValue<Scope>()),
  scopeId: Annotation<string>(lastValue<string>()),
  date: Annotation<string>(lastValue<string>()),
  configVersion: Annotation<string>(lastValue<string>()),

  // — computed scoring outputs the nodes narrate (numbers from the engine) —
  l1: Annotation<number | null>(lastValue<number | null>()),
  l2: Annotation<Record<Dimension, number | null>>(
    lastValue<Record<Dimension, number | null>>(),
  ),
  band: Annotation<Band>(lastValue<Band>()),
  confidence: Annotation<number>(lastValue<number>()),
  confidenceBand: Annotation<ConfidenceBand>(lastValue<ConfidenceBand>()),

  // — deterministic evidence the LLM may cite (read-only) —
  valuesVsAnchor: Annotation<ValueVsAnchor[]>(replaceList<ValueVsAnchor>()),
  deltas: Annotation<DeltaRow[]>(replaceList<DeltaRow>()),
  evidence: Annotation<EvidenceRow[]>(replaceList<EvidenceRow>()),
  prRecords: Annotation<PrRecord[]>(replaceList<PrRecord>()),
  tokensPerPr: Annotation<number | null>(lastValue<number | null>()),

  // — narrative OUTPUTS (append-only; the reducer collects each node's emissions) —
  insights: Annotation<AgentInsight[]>(appendList<AgentInsight>()),
  drivers: Annotation<ChangeDriver[]>(appendList<ChangeDriver>()),
  prLevel: Annotation<PrLevelResult[]>(appendList<PrLevelResult>()),
});

/** The typed state value (what a node receives / returns a partial of). */
export type InsightStateType = typeof InsightState.State;

/** A node returns a partial update of the state channels. */
export type InsightStateUpdate = Partial<InsightStateType>;
