// lib/agents/nodes/ground-run.ts
//
// The shared "narrate → ground → repair-once → drop" runner every LLM node uses. It
// centralizes the determinism boundary's enforcement loop so each node stays a thin
// prompt + selection wrapper:
//
//   1. call the model (real via structured runner, OR the mock builder when keyless);
//   2. run the grounding gate over the produced prose + evidenceRefs;
//   3. if it fails, re-run ONCE with a corrective repairNote appended;
//   4. if it still fails, DROP the item (never persist an ungrounded claim).
//
// Keyless-safe: when shouldUseRealModel() is false the node passes a mock() builder instead
// of a StructuredRunner, so no network call ever happens.

import {
  buildAllowedNumbers,
  checkGrounding,
  evidenceIdSet,
  repairNote,
  type GroundingResult,
} from '../grounding';
import type { EvidenceRow } from '@/lib/types/agents';
import type { NarrativeValidationTrace } from '@/lib/types/agents';

/** The prose fields of one produced item (for the grounding check). */
export interface Groundable {
  prose: string[];
  evidenceRefs: string[];
}

export interface GroundedProduction<T> {
  item: T;
  validation: NarrativeValidationTrace;
}

/**
 * Run one narrative production with grounding + a single repair retry.
 *
 * @param produce   invoked with an optional corrective note; returns the raw item.
 * @param toGroundable  pull prose + refs out of the raw item for the gate.
 * @param evidence  the deterministic evidence set (ids + allowed values).
 * @param extraNumbers  extra allowed numbers rendered into the prompt (scores, deltas).
 * @returns the item if it grounds (possibly after repair), or null if it must be dropped.
 */
export async function groundedProduce<T>(
  produce: (note: string | null) => Promise<T>,
  toGroundable: (item: T) => Groundable,
  evidence: EvidenceRow[],
  extraNumbers: ReadonlyArray<number | null | undefined> = [],
): Promise<{ item: T; validation: NarrativeValidationTrace } | null> {
  const allowed = buildAllowedNumbers(evidence, extraNumbers);
  const ids = evidenceIdSet(evidence);

  const first = await produce(null);
  const g1 = gate(first, toGroundable, allowed, ids);
  if (g1.ok) {
    return {
      item: first,
      validation: { attempts: 1, repaired: false, status: 'accepted', rejectedClaims: [] },
    };
  }

  // One repair retry with a corrective note.
  const repaired = await produce(repairNote(g1.violations));
  const g2 = gate(repaired, toGroundable, allowed, ids);
  if (g2.ok) {
    return {
      item: repaired,
      validation: {
        attempts: 2,
        repaired: true,
        status: 'accepted',
        rejectedClaims: g1.violations.map((violation) => violation.detail),
      },
    };
  }

  // Still failing → drop.
  return null;
}

/**
 * Ground a whole ordered narrative batch with at most one shared repair call.
 *
 * `produce` receives the original item indexes it must narrate and must return its
 * answers in that same order. Only rejected or omitted items are sent to the retry,
 * so a scope with several insights uses one model call in the healthy path and two
 * in the repair path instead of one or two calls per insight.
 */
export async function groundedBatchProduce<T>(
  itemCount: number,
  produce: (note: string | null, indexes: readonly number[]) => Promise<ReadonlyArray<T | undefined>>,
  toGroundable: (item: T) => Groundable,
  evidence: EvidenceRow[],
  extraNumbers: ReadonlyArray<number | null | undefined> = [],
): Promise<Array<GroundedProduction<T> | null>> {
  if (itemCount === 0) return [];

  const allowed = buildAllowedNumbers(evidence, extraNumbers);
  const ids = evidenceIdSet(evidence);
  const allIndexes = Array.from({ length: itemCount }, (_, index) => index);
  const first = await produce(null, allIndexes);
  const firstChecks = allIndexes.map((index) => batchGate(first[index], index, toGroundable, allowed, ids));
  const rejectedIndexes = allIndexes.filter((index) => !firstChecks[index]!.ok);
  let repaired: ReadonlyArray<T | undefined> = [];
  if (rejectedIndexes.length) {
    try {
      repaired = await produce(batchRepairNote(firstChecks, rejectedIndexes), rejectedIndexes);
    } catch {
      // A failed repair must not discard items that already passed the first gate.
      // Rejected items remain dropped; the scope-level pipeline can still publish the
      // independently accepted contracts.
      repaired = [];
    }
  }

  return allIndexes.map((index) => {
    const initial = firstChecks[index]!;
    if (initial.ok && initial.item !== null) {
      return {
        item: initial.item,
        validation: { attempts: 1, repaired: false, status: 'accepted', rejectedClaims: [] },
      };
    }

    const repairedPosition = rejectedIndexes.indexOf(index);
    const retry = batchGate(repaired[repairedPosition], index, toGroundable, allowed, ids);
    if (!retry.ok || retry.item === null) return null;

    return {
      item: retry.item,
      validation: {
        attempts: 2,
        repaired: true,
        status: 'accepted',
        rejectedClaims: initial.violations,
      },
    };
  });
}

interface BatchGate<T> {
  ok: boolean;
  item: T | null;
  violations: string[];
}

function batchGate<T>(
  item: T | undefined,
  index: number,
  toGroundable: (item: T) => Groundable,
  allowed: Set<string>,
  ids: Set<string>,
): BatchGate<T> {
  if (item === undefined) {
    return { ok: false, item: null, violations: [`missing narrative for item ${index + 1}`] };
  }
  const result = gate(item, toGroundable, allowed, ids);
  return {
    ok: result.ok,
    item,
    violations: result.violations.map((violation) => violation.detail),
  };
}

function batchRepairNote<T>(checks: BatchGate<T>[], indexes: readonly number[]): string {
  const details = indexes.flatMap((index) =>
    checks[index]!.violations.map((violation) => `- Item ${index + 1}: ${violation}`),
  );
  return [
    'Your previous batch answer was rejected by the grounding gate for the items below.',
    'Return only corrected narratives for these items, in the supplied order:',
    ...details,
  ].join('\n');
}

function gate<T>(
  item: T,
  toGroundable: (item: T) => Groundable,
  allowed: Set<string>,
  ids: Set<string>,
): GroundingResult {
  const { prose, evidenceRefs } = toGroundable(item);
  return checkGrounding(prose, evidenceRefs, allowed, ids);
}
