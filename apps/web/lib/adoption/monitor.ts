// lib/adoption/monitor.ts
//
// monitorAdoption(functionId, date) — the A2 adoption entry point.
//
// For every OPEN rec in the function it re-reads the SAME evidence (RuleContext) the rec was
// raised on, runs the matching pure predicate to get an evidence-derived AdoptionSignal,
// feeds it through the pure transition state machine, and — only when the status actually
// changes — persists the advance via the service-role client. It NEVER auto-acknowledges
// (that's the user-driven route) and NEVER regresses a status.
//
// DETERMINISM BOUNDARY: the signal, the status transition, and the recorded verified delta
// are all computed in code from real rows. No LLM. Idempotent: a re-run with unchanged
// evidence writes nothing.
//
// SERVER-ONLY.

import { loadContext, openRecsForFunction, updateRecStatus, type RecRow } from '@/lib/recommendations/store';
import type { RuleContext } from '@/lib/recommendations/types';
import { verifyRec } from './predicates';
import { nextStatus, isTransition, type RecStatus } from './transitions';

export interface MonitorResult {
  functionId: string;
  date: string;
  openRecs: number;
  /** recs whose status advanced this run. */
  transitioned: number;
  adopted: number;
  dismissed: number;
  advancedToInProgress: number;
  errors: string[];
}

export async function monitorAdoption(functionId: string, date: string): Promise<MonitorResult> {
  const errors: string[] = [];
  const open = await openRecsForFunction(functionId).catch((e) => {
    errors.push(`openRecsForFunction: ${e instanceof Error ? e.message : String(e)}`);
    return [] as RecRow[];
  });

  // Cache one context per employee — many recs share an employee, re-read evidence once.
  const ctxByEmployee = new Map<string, RuleContext>();
  async function ctxFor(employeeId: string): Promise<RuleContext | null> {
    const hit = ctxByEmployee.get(employeeId);
    if (hit) return hit;
    try {
      const ctx = await loadContext(functionId, employeeId, date);
      ctxByEmployee.set(employeeId, ctx);
      return ctx;
    } catch (e) {
      errors.push(`loadContext(${employeeId}): ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  let transitioned = 0;
  let adopted = 0;
  let dismissed = 0;
  let advancedToInProgress = 0;

  for (const rec of open) {
    const ctx = await ctxFor(rec.employeeId);
    if (!ctx) continue;

    const via = rec.detectedVia ?? '';
    const verified = verifyRec(via, rec.ref, ctx);
    const from = rec.status as RecStatus;
    const to = nextStatus(from, verified.signal);
    if (!isTransition(from, to)) continue; // idempotent no-op

    // Record the verified evidence delta (append-only under `adoption`) alongside the
    // original before/after/delta the rec was raised on. All numbers computed in code.
    const merged = mergeAdoptionEvidence(rec.evidenceJsonb, {
      verified_at: date,
      signal: verified.signal,
      measured: verified.measured,
      target: verified.target,
      delta:
        verified.measured !== null && verified.target !== null
          ? Number((verified.measured - verified.target).toFixed(3))
          : null,
      unit: verified.unit,
      from,
      to,
    });

    const res = await updateRecStatus(rec.id, to, merged);
    if (!res.ok) {
      errors.push(`updateRecStatus(${rec.id} ${from}→${to}): ${res.error}`);
      continue;
    }
    transitioned += 1;
    if (to === 'adopted') adopted += 1;
    else if (to === 'dismissed') dismissed += 1;
    else if (to === 'in_progress') advancedToInProgress += 1;
  }

  return {
    functionId,
    date,
    openRecs: open.length,
    transitioned,
    adopted,
    dismissed,
    advancedToInProgress,
    errors,
  };
}

/** Merge the verified-adoption record into the rec's evidence_jsonb WITHOUT losing the
 *  original before/after/delta. Appends to an `adoption` history array (append-only). */
function mergeAdoptionEvidence(
  existing: Record<string, unknown>,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const prior = Array.isArray(existing.adoption) ? (existing.adoption as unknown[]) : [];
  return { ...existing, adoption: [...prior, entry] };
}
