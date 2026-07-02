// lib/recommendations/engine.ts
//
// deriveAndStoreRecommendations(functionId, date) — the A2 entry point.
//
// For each active employee it assembles the RuleContext (SAME raw + computed evidence the
// scoring engine used), runs every rule in registry order, DEDUPES to one OPEN rec per
// (employee, kind, ref), and persists the new ones via the service-role client. Existing
// OPEN recs are left untouched (their lifecycle is the adoption monitor's job).
//
// PURE-then-persist: rules are pure (no I/O); this module does the I/O. NO LLM — the rule's
// own rationale sentence is stored verbatim (agents narrate elsewhere). Every number in a
// rec is computed in code by the rule from real rows.
//
// SERVER-ONLY.

import { ALL_RULES } from './rules';
import {
  activeEmployees,
  insertRec,
  loadContext,
  openRecsFor,
} from './store';
import type { RuleContext, RuleOutput } from './types';

export interface DeriveResult {
  functionId: string;
  date: string;
  employeesScanned: number;
  /** rules that fired (before dedupe). */
  candidates: number;
  /** new recs actually inserted (after dedupe against open recs). */
  inserted: number;
  /** candidates skipped because an OPEN rec already exists for (employee, kind, ref). */
  skippedExisting: number;
  errors: string[];
}

/** The dedupe key for "one OPEN rec per (employee, kind, ref)". */
function slot(kind: string, ref: string): string {
  return `${kind}::${ref}`;
}

/** Run every rule over a context; return the outputs that fired (nulls dropped). Pure. */
export function runRules(ctx: RuleContext): RuleOutput[] {
  const out: RuleOutput[] = [];
  for (const rule of ALL_RULES) {
    const r = rule.run(ctx);
    if (r) out.push(r);
  }
  return out;
}

export async function deriveAndStoreRecommendations(
  functionId: string,
  date: string,
): Promise<DeriveResult> {
  const errors: string[] = [];
  const employees = await activeEmployees(functionId).catch((e) => {
    errors.push(`activeEmployees: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  });

  let candidates = 0;
  let inserted = 0;
  let skippedExisting = 0;

  for (const emp of employees) {
    let ctx: RuleContext;
    try {
      ctx = await loadContext(functionId, emp.id, date);
    } catch (e) {
      errors.push(`loadContext(${emp.id}): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    const fired = runRules(ctx);
    candidates += fired.length;

    // Dedupe against existing OPEN recs AND within this run (a rule family can only fire
    // one ref, but guard anyway so a re-run never double-inserts).
    const open = await openRecsFor(emp.id).catch(() => []);
    const taken = new Set(open.map((r) => slot(r.kind, r.ref)));

    for (const out of fired) {
      const key = slot(out.kind, out.ref);
      if (taken.has(key)) {
        skippedExisting += 1;
        continue;
      }
      const res = await insertRec(functionId, emp.id, date, out);
      if (res.ok) {
        inserted += 1;
        taken.add(key); // prevent an intra-run dup
      } else {
        // A unique-violation here means a concurrent open rec exists → treat as skip, not error.
        if (isUniqueViolation(res.error)) {
          skippedExisting += 1;
          taken.add(key);
        } else {
          errors.push(`insertRec(${emp.id}, ${key}): ${res.error}`);
        }
      }
    }
  }

  return {
    functionId,
    date,
    employeesScanned: employees.length,
    candidates,
    inserted,
    skippedExisting,
    errors,
  };
}

/** Postgres unique-violation (23505) or the partial-unique index message. */
function isUniqueViolation(msg: string | null): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('duplicate key') || m.includes('23505') || m.includes('recommendations_open_unique');
}
