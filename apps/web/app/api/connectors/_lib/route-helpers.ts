// app/api/connectors/_lib/route-helpers.ts
//
// Shared plumbing for the Admin connector route handlers (M2). One place for:
//   • JSON Response builders (ok / badRequest / serverError);
//   • bootstrap-function resolution — the REAL functions.id the connectors write to.
//
// Connectors WRITE with the service role, so they resolve the persisted function row
// directly instead of relying on request-scoped RLS reads.
//
// SERVER-ONLY: imports the service-role admin client. Never bundle into client code.

import { createAdminClient } from '@/lib/supabase/admin';
import { appTable } from '@/lib/supabase/server';
import { isConfigured } from '@/lib/config/env';

// ─────────────────────────────────────────────────────────────────────────────
// JSON responses
// ─────────────────────────────────────────────────────────────────────────────

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

/** 200 JSON. */
export function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** 400 JSON with an `error` message. */
export function badRequest(error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), { status: 400, headers: JSON_HEADERS });
}

/** 500 JSON with an `error` message (never leaks a stack). */
export function serverError(error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), { status: 500, headers: JSON_HEADERS });
}

/** 503 JSON for a keyless / not-configured path that still answers cleanly. */
export function notConfigured(detail: string): Response {
  return new Response(
    JSON.stringify({ ok: true, status: 'not_configured', detail }),
    { status: 200, headers: JSON_HEADERS },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap function resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the REAL bootstrap function id the connectors should write to. Today there is
 * exactly one `functions` row (org = me = team); we read it via the service-role client
 * so the answer is always a live database id. Returns null only when Supabase is
 * unconfigured or the table is empty.
 */
export async function resolveBootstrapFunctionId(): Promise<string | null> {
  if (!isConfigured('supabase')) return null;
  try {
    const db = appTable(createAdminClient());
    const { data } = await db.from('functions').select('id').limit(1).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Read a JSON body safely; returns null on empty/invalid bodies (callers 400). */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Human message from an unknown thrown value. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
