// lib/db/roster.ts
//
// The Team-view roster: one row per active employee in a function, joined to that
// employee's latest index_daily (L1 + the four L2s + tokens/PR + 7-day delta).
// N-member-native — loops over all employees; the demo is just N=1.
//
// Empty when no employees / no index rows: every numeric is null and the token
// label is the em-dash (no fabricated scores).

import type { MemberRowDTO } from '@/lib/ui/view-models';
import { NO_SIGNAL, fmtTokens } from '@/lib/format';
import {
  db,
  selectRows,
  computeWindow,
  deltaDto,
  getCurrentEmployeeId,
  type DbReadFilter,
} from './_base';

interface EmployeeLite {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  active: boolean;
}

interface IndexLite {
  scope_id: string;
  date: string;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  tokens_per_pr: number | null;
}

export async function getRoster(functionId: string): Promise<MemberRowDTO[]> {
  const client = await db();
  const meId = await getCurrentEmployeeId();

  const employees = (await selectRows(
    client
      .from('employees')
      .select('id, name, email, active, designation')
      .eq('function_id', functionId) as DbReadFilter,
  )) as unknown as EmployeeLite[];

  const active = employees.filter((e) => e.active !== false);
  if (active.length === 0) return [];

  // Latest employee-scope index rows in the window, newest-first; pick first per scope_id.
  const idxRows = (await employeeIndexRows(functionId)) as IndexLite[];
  const latestByEmp = new Map<string, IndexLite>();
  for (const r of idxRows) {
    if (!latestByEmp.has(r.scope_id)) latestByEmp.set(r.scope_id, r);
  }
  // Baseline 7 days back for the d7 delta.
  const baselineByEmp = new Map<string, IndexLite>();
  for (const r of idxRows) {
    const cur = latestByEmp.get(r.scope_id);
    if (cur && r.date < cur.date && !baselineByEmp.has(r.scope_id)) baselineByEmp.set(r.scope_id, r);
  }

  const rows: MemberRowDTO[] = active.map((emp) => {
    const idx = latestByEmp.get(emp.id) ?? null;
    const base = baselineByEmp.get(emp.id) ?? null;
    const d7delta = idx && base && idx.l1 !== null && base.l1 !== null ? idx.l1 - base.l1 : null;
    return {
      id: emp.id,
      name: emp.name,
      role: emp.designation ?? '',
      you: meId !== null && emp.id === meId,
      l1: idx?.l1 ?? null,
      l2: {
        usage: idx?.l2_usage ?? null,
        eff: idx?.l2_eff ?? null,
        effness: idx?.l2_effness ?? null,
        prof: idx?.l2_prof ?? null,
      },
      tokensPerPrLabel: idx?.tokens_per_pr != null ? fmtTokens(idx.tokens_per_pr) : NO_SIGNAL,
      d7: deltaDto(d7delta),
    };
  });

  // Sort by L1 desc (nulls last), mirroring the reference roster ordering.
  rows.sort((a, b) => {
    if (a.l1 === null && b.l1 === null) return a.name.localeCompare(b.name);
    if (a.l1 === null) return 1;
    if (b.l1 === null) return -1;
    return b.l1 - a.l1;
  });

  return rows;
}

/** All employee-scope index_daily rows in the window for a function, newest-first. */
async function employeeIndexRows(functionId: string): Promise<unknown[]> {
  const client = await db();
  const { start } = computeWindow();
  const raw = await selectRows(
    client
      .from('index_daily')
      .select('scope_id, date, l1, l2_usage, l2_eff, l2_effness, l2_prof, tokens_per_pr, scope, function_id')
      .eq('scope', 'employee')
      .eq('function_id', functionId)
      .order('date', { ascending: false }) as DbReadFilter,
  );
  return (raw as Array<{ date: string }>).filter((r) => !start || r.date >= start);
}
