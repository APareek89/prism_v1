// lib/connectors/claude-code/session-map.ts
//
// The DB write layer for the Claude Code connector. Takes parsed RawSessions and
// upserts public.cc_sessions via the SERVICE-ROLE admin client (RLS-bypassing —
// the scan runs outside a user request). SERVER-ONLY.
//
// AUTHORITATIVE columns (migration 0008 — read it, do not guess):
//   cc_sessions: id, function_id, employee_id, account_uuid, session_id, repo,
//   branch, ts, turns, tokens_in(bigint), tokens_out(bigint), cache_read(bigint),
//   cache_creation(bigint), cost_usd(numeric), model, suggestions_offered,
//   suggestions_accepted, skills_used(text[]), prompt_len_avg, linked_pr,
//   ingested_at.  UNIQUE(session_id, repo).
//
// Binding (single-person demo): every local session binds to the "self employee"
// (the is_demo employee for the bootstrap function). account_uuid stays null (the
// .jsonl has no top-level uuid — Landmine #1). A session with no resolvable
// employee is written with employee_id null and flagged unmatched (excluded from
// AI rates downstream by byo.ts).

import { createAdminClient } from '@/lib/supabase/admin';
import type { RawSession } from './parser';
import { classifyByo, sessionKey, type ByoClassification } from './byo';

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin surface (the generated `Database` placeholder has empty Tables, so
// service-role writes go through this cast — mirrors lib/connectors/identity.ts).
// ─────────────────────────────────────────────────────────────────────────────

interface AdminFilter extends PromiseLike<{ data: unknown; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => AdminFilter;
  limit: (n: number) => AdminFilter;
  select: (cols?: string) => AdminFilter;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
}
interface AdminTable {
  select: (cols: string) => AdminFilter;
  insert: (rows: unknown) => AdminFilter;
  update: (patch: unknown) => AdminFilter;
  upsert: (rows: unknown, opts?: { onConflict?: string }) => AdminFilter;
}
interface AdminDb {
  from: (table: string) => AdminTable;
}

/** The RLS-bypassing admin db, loosely typed for keyless-empty-schema writes. */
function adminDb(): AdminDb {
  return createAdminClient() as unknown as AdminDb;
}

/** The cc_sessions insert payload — keys are EXACT column names from 0008 (+ pr_refs
 *  added in migration 0033). */
export interface CcSessionInsert {
  function_id: string;
  employee_id: string | null;
  account_uuid: string | null;
  session_id: string;
  repo: string;
  branch: string | null;
  ts: string | null;
  turns: number;
  tokens_in: number;
  tokens_out: number;
  cache_read: number;
  cache_creation: number;
  cost_usd: number;
  model: string | null;
  suggestions_offered: number;
  suggestions_accepted: number;
  skills_used: string[];
  prompt_len_avg: number | null;
  /** PRs this session opened/pushed (Claude Code `pr-link` events). jsonb array of
   *  {repo, number}. The exact first-party join key the AI→PR linker reads. */
  pr_refs: Array<{ repo: string; number: number }>;
}

/** What a write returns: how many rows were upserted + the BYO classification. */
export interface PersistResult {
  written: number;
  skipped: number;
  classification: ByoClassification;
  errors: string[];
}

/** Map one RawSession → a cc_sessions insert row, bound to (functionId, employeeId). */
export function toCcSessionRow(
  s: RawSession,
  functionId: string,
  employeeId: string | null,
): CcSessionInsert {
  return {
    function_id: functionId,
    employee_id: employeeId,
    account_uuid: null, // Landmine #1: no top-level uuid in local .jsonl.
    session_id: s.sessionId,
    repo: s.repo,
    branch: s.branch,
    ts: s.ts,
    turns: s.turns,
    tokens_in: s.tokensIn,
    tokens_out: s.tokensOut,
    cache_read: s.cacheRead,
    cache_creation: s.cacheCreation,
    cost_usd: s.costUsd,
    model: s.model,
    suggestions_offered: s.suggestionsOffered,
    suggestions_accepted: s.suggestionsAccepted,
    skills_used: s.skillsUsed,
    prompt_len_avg: s.promptLenAvg,
    pr_refs: s.prRefs.map((r) => ({ repo: r.repo, number: r.number })),
  };
}

/**
 * Find the single "self employee" (is_demo=true) for the function, returning its id
 * or null. Mirrors the convention used by the GitHub/Sentry connectors. Never throws.
 */
async function findSelfEmployeeId(functionId: string): Promise<string | null> {
  try {
    const db = adminDb();
    const { data } = await db
      .from('employees')
      .select('id')
      .eq('function_id', functionId)
      .eq('is_demo', true)
      .limit(1)
      .maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Ensure the single demo "self employee" exists for the function (is_demo=true),
 * created on first scan. Idempotent — a no-op once the row exists. Returns the id.
 * Mirrors the Sentry connector's convention (name 'You', attribution 'matched').
 * Never throws — failure leaves sessions unbound (employee_id null), which byo.ts
 * then classifies as unmatched.
 */
export async function ensureSelfEmployee(functionId: string): Promise<string | null> {
  const existing = await findSelfEmployeeId(functionId);
  if (existing) return existing;
  try {
    const db = adminDb();
    const { data } = await db
      .from('employees')
      .insert({
        function_id: functionId,
        name: 'You',
        attribution_mode: 'matched',
        match_status: 'linked',
        active: true,
        is_demo: true,
      })
      .select('id')
      .single();
    if (data?.id) return data.id as string;
  } catch {
    // race / transient — re-resolve.
  }
  return findSelfEmployeeId(functionId);
}

/**
 * Persist parsed sessions into cc_sessions for the function. Binds every session to
 * the self employee (single-person demo); sessions that fail to bind are written
 * unbound and classified unmatched. Upserts on (session_id, repo). SERVER-ONLY.
 *
 * Returns the write tally + BYO classification (so the connector can surface the
 * coverage/confidence note). DB errors are collected, not thrown — the connector
 * decides health from them.
 */
export async function persistSessions(
  functionId: string,
  sessions: readonly RawSession[],
): Promise<PersistResult> {
  const errors: string[] = [];

  // 1) Ensure (and resolve) the self employee. Every demo session binds to it.
  const selfId = await ensureSelfEmployee(functionId);

  // 2) BYO classification. For the demo, the self employee binds ALL sessions, so
  //    boundKeys covers everything when selfId resolved; otherwise nothing binds.
  const boundKeys = new Set<string>(
    selfId ? sessions.map((s) => sessionKey(s)) : [],
  );
  const classification = classifyByo(sessions, boundKeys);

  if (sessions.length === 0) {
    return { written: 0, skipped: 0, classification, errors };
  }

  // 3) Build rows: matched → bound to selfId; unmatched → employee_id null.
  const rows: CcSessionInsert[] = sessions.map((s) => {
    const isMatched = boundKeys.has(sessionKey(s));
    return toCcSessionRow(s, functionId, isMatched ? selfId : null);
  });

  // 4) Upsert on the UNIQUE(session_id, repo) constraint.
  let written = 0;
  try {
    const db = adminDb();
    const { error } = await db
      .from('cc_sessions')
      .upsert(rows, { onConflict: 'session_id,repo' });
    if (error) {
      errors.push(
        `cc_sessions upsert failed: ${(error as { message?: string }).message ?? 'unknown error'}`,
      );
    } else {
      written = rows.length;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'cc_sessions upsert threw');
  }

  return {
    written,
    skipped: sessions.length - written,
    classification,
    errors,
  };
}
