// lib/agents/__tests__/fixtures.ts
//
// Deterministic fixtures for the agent unit tests. No I/O — plain data only. These
// mirror the shapes assemble.ts builds so grounding + classification can be tested
// without a database or a model.

import type { EvidenceRow } from '@/lib/types/agents';
import type { ValueVsAnchor, DeltaRow, PrRecord } from '../state';
import type { PrClassifierInput } from '../nodes/pr-classify';

/** A small evidence set with known numeric values (40, 62, −8). */
export const EVIDENCE: EvidenceRow[] = [
  { id: 'kpi:ai_assisted_pr_share:usage', label: 'ai_assisted_pr_share normalized (usage)', value: 40 },
  { id: 'kpi:merged_without_revert_rate:effectiveness', label: 'merged_without_revert_rate normalized (effectiveness)', value: 62 },
  { id: 'delta:efficiency', label: 'efficiency change vs baseline', value: -8 },
];

export const EVIDENCE_IDS: string[] = EVIDENCE.map((e) => e.id);

/** One value-vs-anchor row (usage, below target). */
export const USAGE_AREA: ValueVsAnchor = {
  kpiId: 'ai_assisted_pr_share',
  dimension: 'usage',
  raw: 0.4,
  norm: 40,
  floor: 0,
  target: 100,
  weight: 0.1,
  metMinSignal: true,
};

/** A strength row (effectiveness, at/above 80). */
export const EFFECTIVENESS_STRENGTH: ValueVsAnchor = {
  kpiId: 'merged_without_revert_rate',
  dimension: 'effectiveness',
  raw: 0.92,
  norm: 88,
  floor: 0,
  target: 100,
  weight: 0.4,
  metMinSignal: true,
};

/** A downward efficiency delta. */
export const EFFICIENCY_DELTA: DeltaRow = {
  key: 'efficiency',
  dimension: 'efficiency',
  latest: 54,
  baseline: 62,
  delta: -8,
  direction: 'down',
};

// ─────────────────────────────────────────────────────────────────────────────
// PR classifier inputs (one per verdict + edge cases)
// ─────────────────────────────────────────────────────────────────────────────

export const PR_CLEAN: PrClassifierInput = {
  aiLinked: true,
  isMerged: true,
  revertedWithin14d: false,
  isSelfRevert: false,
  agenticMajority: false,
  defectReworkWithin14d: false,
  aiIterations: 3,
  sizeBucket: 'M',
};

export const PR_REVERT: PrClassifierInput = {
  ...PR_CLEAN,
  revertedWithin14d: true,
};

export const PR_SELF_REVERT: PrClassifierInput = {
  ...PR_CLEAN,
  revertedWithin14d: true,
  isSelfRevert: true, // excluded from the revert verdict
};

export const PR_SLOP: PrClassifierInput = {
  ...PR_CLEAN,
  agenticMajority: true,
  defectReworkWithin14d: true,
};

export const PR_REPROMPT: PrClassifierInput = {
  ...PR_CLEAN,
  aiIterations: 12, // >= REPROMPT_ITERATION_THRESHOLD (8)
};

/** A full PrRecord (classified) for the mock-model test. */
export const PR_RECORD_REVERT: PrRecord = {
  prId: 'pr-123',
  ref: '#123',
  sizeBucket: 'L',
  aiLinked: true,
  revertedWithin14d: true,
  isSelfRevert: false,
  agenticMajority: false,
  defectReworkWithin14d: false,
  aiIterations: 5,
  isMerged: true,
  verdict: 'revert',
};

/** Per-PR evidence for PR_RECORD_REVERT. */
export const PR_EVIDENCE: EvidenceRow[] = [
  { id: 'pr:pr-123:iterations', label: '#123 AI iterations', value: 5 },
  { id: 'pr:pr-123:size', label: '#123 size bucket', value: 'L' },
  { id: 'pr:pr-123:verdict', label: '#123 verdict', value: 'revert' },
];
