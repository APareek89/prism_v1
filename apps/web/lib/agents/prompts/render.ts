// lib/agents/prompts/render.ts
//
// Shared prompt-rendering helpers: the scope header and the EVIDENCE block that every
// node prompt embeds. Rendering the same deterministic inputs the grounding gate reads
// keeps the two in lockstep — the model only ever sees (and can only cite) the exact
// numbers that will be allowed through the gate.

import type { InsightStateType, ValueVsAnchor, DeltaRow, PrRecord } from '../state';
import type { EvidenceRow } from '@/lib/types/agents';
import { DIMENSION_LABEL } from './labels';

/** A one-line scope + score header for the model's context. */
export function scopeHeader(state: InsightStateType): string {
  const l1 = state.l1 === null ? 'suppressed (below confidence floor)' : String(state.l1);
  const l2 = (['usage', 'efficiency', 'effectiveness', 'proficiency'] as const)
    .map((d) => `${DIMENSION_LABEL[d]}=${fmt(state.l2?.[d] ?? null)}`)
    .join(', ');
  return [
    `SCOPE: ${state.scope} (${state.scopeId})`,
    `DATE: ${state.date}`,
    `AI-Native Index (L1): ${l1}`,
    `L2 sub-indexes: ${l2}`,
    `Confidence: ${state.confidenceBand} (${fmt(state.confidence)})`,
    `Band: ${state.band}`,
  ].join('\n');
}

/** The EVIDENCE list — the ONLY ids the model may cite. */
export function evidenceBlock(evidence: EvidenceRow[]): string {
  if (evidence.length === 0) return 'EVIDENCE: (none)';
  const lines = evidence.map((e) => `- ${e.id} | ${e.label} | ${e.value}`);
  return `EVIDENCE (cite these ids only):\n${lines.join('\n')}`;
}

/** Render the value-vs-anchor table for the improvement / attribution prompts. */
export function anchorTable(rows: ValueVsAnchor[]): string {
  if (rows.length === 0) return '(no KPI signal)';
  return rows
    .map(
      (r) =>
        `- ${r.kpiId} [${DIMENSION_LABEL[r.dimension]}]: value=${fmt(r.raw)} normalized=${fmt(
          r.norm,
        )}/100 target=${fmt(r.target)} weight=${fmt(r.weight)}`,
    )
    .join('\n');
}

/** Render the delta table for the change-governance prompt. */
export function deltaTable(rows: DeltaRow[]): string {
  if (rows.length === 0) return '(no movement to explain)';
  return rows
    .map(
      (r) =>
        `- ${r.dimension ? DIMENSION_LABEL[r.dimension] : 'AI-Native Index (L1)'}: ` +
        `${fmt(r.baseline)} → ${fmt(r.latest)} (${r.direction}, delta ${fmt(r.delta)})`,
    )
    .join('\n');
}

/** Render a single PR's deterministic signals for the pr-level prompt. */
export function prSignals(pr: PrRecord): string {
  const flags = [
    pr.aiLinked ? 'ai-linked' : null,
    pr.agenticMajority ? 'agentic-majority' : null,
    pr.revertedWithin14d ? 'reverted-within-14d' : null,
    pr.isSelfRevert ? 'self-revert' : null,
    pr.defectReworkWithin14d ? 'defect-rework-within-14d' : null,
  ].filter((x): x is string => x !== null);
  return [
    `PR ${pr.ref} (${pr.prId})`,
    `size: ${pr.sizeBucket}`,
    `merged: ${pr.isMerged}`,
    `ai iterations: ${pr.aiIterations}`,
    `signals: ${flags.length ? flags.join(', ') : 'none'}`,
    `verdict (already decided in code): ${pr.verdict}`,
  ].join('\n');
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return String(Number.isInteger(v) ? v : Number(v.toFixed(2)));
}
