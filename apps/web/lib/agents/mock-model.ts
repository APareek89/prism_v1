// lib/agents/mock-model.ts
//
// The keyless / DEMO_MODE narration path. When ANTHROPIC isn't configured (or
// DEMO_MODE is on) the graph must still run end-to-end and produce SCHEMA-VALID,
// GROUNDING-CLEAN narration — without a network call. These builders synthesize that
// narration deterministically from the SAME deterministic inputs the real LLM would
// read (state values), so:
//   • every sentence is grounded (it only restates provided evidence, no new numbers);
//   • every evidenceRef points at an id that exists in the provided evidence set;
//   • output is stable (a demo run is reproducible and $0).
//
// The numbers still come from code — the mock, like the LLM, only writes prose and
// cites evidence. It never invents a metric.

import type {
  ImprovementAreaOutput,
  ChangeGovernanceOutput,
  ImprovementAttributionOutput,
  PrLevelNarrative,
} from './schemas';
import type { ValueVsAnchor, DeltaRow, PrRecord } from './state';
import type { EvidenceRow, PrVerdict } from '@/lib/types/agents';
import { DIMENSION_LABEL } from './prompts/labels';

// ---------------------------------------------------------------------------
// Small grounded phrasing helpers (no fabricated numbers — restate inputs only)
// ---------------------------------------------------------------------------

/** ids of every evidence row that mentions a dimension, so the mock can cite honestly. */
function refsForDimension(evidence: EvidenceRow[], dimension: string): string[] {
  return evidence.filter((e) => e.id.includes(dimension)).map((e) => e.id);
}

/** A single evidence id (first match) or []. */
function firstRef(ids: string[]): string[] {
  return ids.length > 0 ? [ids[0]!] : [];
}

// ---------------------------------------------------------------------------
// improvement-area
// ---------------------------------------------------------------------------

export function mockImprovementArea(
  areas: ValueVsAnchor[],
  evidence: EvidenceRow[],
): ImprovementAreaOutput {
  const items = areas.map((a) => {
    const label = DIMENSION_LABEL[a.dimension];
    const refs = refsForDimension(evidence, a.dimension);
    return {
      title: `Lift ${label} on ${a.kpiId}`,
      body:
        `${label} sits below its target on ${a.kpiId}; closing the gap toward the ` +
        `anchor target is the highest-leverage move for this scope.`,
      evidenceRefs: firstRef(refs.length > 0 ? refs : [`kpi:${a.kpiId}`].filter((id) => evidence.some((e) => e.id === id))),
    };
  });
  return { items };
}

// ---------------------------------------------------------------------------
// change-governance
// ---------------------------------------------------------------------------

export function mockChangeGovernance(
  deltas: DeltaRow[],
  evidence: EvidenceRow[],
): ChangeGovernanceOutput {
  const drivers = deltas.map((d) => {
    const label = d.dimension ? DIMENSION_LABEL[d.dimension] : 'AI-Native Index';
    const dirWord = d.direction === 'up' ? 'rose' : d.direction === 'down' ? 'fell' : 'held';
    const key = d.dimension ?? 'l1';
    const refs = refsForDimension(evidence, key);
    return {
      title: `${label} ${dirWord}`,
      body: `${label} ${dirWord} versus the baseline window, moving the index for this scope.`,
      evidenceRefs: firstRef(refs),
    };
  });
  return { drivers };
}

// ---------------------------------------------------------------------------
// improvement-attribution
// ---------------------------------------------------------------------------

export function mockImprovementAttribution(
  strengths: ValueVsAnchor[],
  evidence: EvidenceRow[],
): ImprovementAttributionOutput {
  const items = strengths.map((s) => {
    const label = DIMENSION_LABEL[s.dimension];
    const refs = refsForDimension(evidence, s.dimension);
    return {
      title: `${label} is holding strong`,
      body:
        `${label} is at or above its anchor target on ${s.kpiId}, a genuine strength ` +
        `worth protecting as volume grows.`,
      evidenceRefs: firstRef(refs.length > 0 ? refs : []),
    };
  });
  return { items };
}

// ---------------------------------------------------------------------------
// pr-level (reason + fix; verdict comes from code)
// ---------------------------------------------------------------------------

// NOTE: these strings are number-free by design — the mock, like the LLM, may not
// quote a figure that isn't in the PR's evidence set. The size bucket is a letter
// (S/M/L), not a number, so it is safe to include.
const VERDICT_REASON: Record<PrVerdict, (pr: PrRecord) => string> = {
  revert: (pr) =>
    `This ${pr.sizeBucket}-sized PR was reverted soon after merge, signalling the ` +
    `change did not hold in production.`,
  ai_slop: (pr) =>
    `This AI-majority ${pr.sizeBucket}-sized PR needed fix-type rework shortly after merge, a ` +
    `sign the generated change shipped before it was solid.`,
  re_prompt: (pr) =>
    `This PR took several AI iterations before it merged cleanly, pointing to a prompting ` +
    `loop that could be tightened.`,
  clean: (pr) =>
    `This ${pr.sizeBucket}-sized PR merged cleanly with no revert or rework — a healthy ` +
    `AI-assisted change.`,
};

const VERDICT_FIX: Record<PrVerdict, string> = {
  revert: 'Add a regression test that reproduces the reverted failure before re-landing.',
  ai_slop: 'Review AI-generated diffs against a checklist before merge; add a test for the reworked path.',
  re_prompt: 'Capture the working prompt as a reusable skill so the next similar change lands in one pass.',
  clean: 'Keep going — this is the pattern to repeat.',
};

export function mockPrLevel(pr: PrRecord, evidence: EvidenceRow[]): PrLevelNarrative {
  const refs = evidence.filter((e) => e.id.includes(pr.prId) || e.id.includes(pr.ref)).map((e) => e.id);
  return {
    reason: VERDICT_REASON[pr.verdict](pr),
    fix: VERDICT_FIX[pr.verdict],
    evidenceRefs: firstRef(refs),
  };
}
