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

/** The prose fields of one produced item (for the grounding check). */
export interface Groundable {
  prose: string[];
  evidenceRefs: string[];
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
): Promise<T | null> {
  const allowed = buildAllowedNumbers(evidence, extraNumbers);
  const ids = evidenceIdSet(evidence);

  const first = await produce(null);
  const g1 = gate(first, toGroundable, allowed, ids);
  if (g1.ok) return first;

  // One repair retry with a corrective note.
  const repaired = await produce(repairNote(g1.violations));
  const g2 = gate(repaired, toGroundable, allowed, ids);
  if (g2.ok) return repaired;

  // Still failing → drop.
  return null;
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
