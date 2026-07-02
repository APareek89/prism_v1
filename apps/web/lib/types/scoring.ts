// lib/types/scoring.ts
//
// App-facing scoring CONTRACTS. These mirror the shapes the scoring engine emits
// so the UI/agents can consume them WITHOUT importing from lib/scoring (the engine
// keeps its own self-contained copy for M0; reconciled at M3 — ownership-map).
// Enums (Band/ConfidenceBand/SizeBucket/Dimension/KpiId) come from db.ts.

import type { Band, ConfidenceBand, Dimension, KpiId, Scope, SizeBucket } from './db';

export type { Band, ConfidenceBand, Dimension, KpiId, Scope, SizeBucket };

/** A normalized KPI value with its anchor pair, for transparency/grounding. */
export interface KpiValue {
  kpiId: KpiId;
  dimension: Dimension;
  /** raw formula value; null when no denominator. */
  raw: number | null;
  /** 0–100 against frozen anchors; null when raw is null. */
  norm: number | null;
  anchorFloor: number | null;
  anchorTarget: number;
  inverted: boolean;
  /** underlying observation count → feeds confidence. */
  signals: number;
  metMinSignal: boolean;
}

/** One L2 sub-index. */
export interface L2 {
  dimension: Dimension;
  score: number | null;
  signals: number;
  metMinSignal: boolean;
  kpis: KpiValue[];
}

/** The confidence result. */
export interface Confidence {
  score: number;
  band: ConfidenceBand;
  shouldSuppressL1: boolean;
  cohortPenaltyApplied: boolean;
}

/** The token cost-lens (FinOps). */
export interface TokensPerPr {
  tokensPerPr: number | null;
  cacheReadShare: number | null;
  compactionSignal: number | null;
  mergedPrs: number;
}

/** A full index result for one scope+date, ready for the UI. */
export interface IndexResult {
  scope: Scope;
  scopeId: string;
  date: string;
  configVersion: string;
  l1: number | null;
  l2: Record<Dimension, L2>;
  band: Band;
  confidence: Confidence;
  tokensPerPr: TokensPerPr;
  aiActiveShare: number | null;
  multiplierSignal: number;
}

/** A presentation delta vs a baseline (period toggle). Presentation only. */
export interface DeltaRow {
  /** current value. */
  value: number | null;
  /** baseline value the delta is measured against. */
  baseline: number | null;
  /** value - baseline; null if either side is null. */
  delta: number | null;
}
