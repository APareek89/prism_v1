// lib/connectors/status.ts
//
// Read/write the `connectors` table (migration 0006) via the SERVICE-ROLE client.
// This is the one chokepoint connectors use to report health + persist non-secret
// config. RLS is bypassed (admin client) because the pipeline/webhook runs outside a
// user request; never import this into a client bundle.
//
// AUTHORITATIVE columns (0006): id, function_id, type(connector_type),
//   status('not_configured'|'connected'|'error'|'syncing'), config_jsonb,
//   last_sync_at, last_error, created_at, updated_at. UNIQUE(function_id, type).
//
// The generated `Database` placeholder has empty Tables, so writes go through a
// loosely-typed surface cast from the admin client (same escape hatch as lib/db).

import { createAdminClient } from '@/lib/supabase/admin';
import type { ConnectorStatus, ConnectorType } from '@/lib/types/db';

// ─────────────────────────────────────────────────────────────────────────────
// Loose write surface (the generated Database has no Tables yet)
// ─────────────────────────────────────────────────────────────────────────────

interface LooseResult extends Promise<{ data: unknown; error: { message?: string } | null }> {
  eq: (col: string, val: unknown) => LooseResult;
  select: (cols?: string) => LooseResult;
  order: (col: string, opts?: unknown) => LooseResult;
  limit: (n: number) => LooseResult;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
}
interface LooseTable {
  select: (cols: string) => LooseResult;
  insert: (rows: unknown) => LooseResult;
  update: (patch: unknown) => LooseResult;
  upsert: (rows: unknown, opts?: { onConflict?: string }) => LooseResult;
}
interface LooseAdmin {
  from: (table: string) => LooseTable;
}

/** The service-role client as a loose query surface (empty generated Tables). */
function admin(): LooseAdmin {
  return createAdminClient() as unknown as LooseAdmin;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/** The connectors row shape we read/write here (subset of 0006). */
export interface ConnectorRecord {
  status: ConnectorStatus;
  config_jsonb: Record<string, unknown>;
  last_sync_at: string | null;
  last_error: string | null;
}

/**
 * Read the connector record for (functionId, type). Returns null when no row exists
 * (never configured). Never throws — DB/keyless errors collapse to null.
 */
export async function getConnectorRecord(
  functionId: string,
  type: ConnectorType,
): Promise<ConnectorRecord | null> {
  try {
    const { data, error } = await admin()
      .from('connectors')
      .select('status, config_jsonb, last_sync_at, last_error')
      .eq('function_id', functionId)
      .eq('type', type)
      .maybeSingle();
    if (error || !data) return null;
    return {
      status: (data.status as ConnectorStatus) ?? 'not_configured',
      config_jsonb: (data.config_jsonb as Record<string, unknown>) ?? {},
      last_sync_at: (data.last_sync_at as string | null) ?? null,
      last_error: (data.last_error as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Read just the status; 'not_configured' when no row exists. Never throws. */
export async function getConnectorStatus(
  functionId: string,
  type: ConnectorType,
): Promise<ConnectorStatus> {
  const rec = await getConnectorRecord(functionId, type);
  return rec?.status ?? 'not_configured';
}

// ─────────────────────────────────────────────────────────────────────────────
// Write (upsert on the UNIQUE(function_id, type) constraint)
// ─────────────────────────────────────────────────────────────────────────────

/** Whether a write succeeded; carries the error message for the caller's log. */
export interface WriteResult {
  ok: boolean;
  error: string | null;
}

const ok: WriteResult = { ok: true, error: null };
function fail(message: string): WriteResult {
  return { ok: false, error: message };
}

/**
 * Set the status (and optionally last_error) for a connector, upserting the row if
 * absent. Clears last_error on any non-'error' status. Idempotent.
 */
export async function setStatus(
  functionId: string,
  type: ConnectorType,
  status: ConnectorStatus,
  lastError: string | null = null,
): Promise<WriteResult> {
  try {
    const row = {
      function_id: functionId,
      type,
      status,
      // Only an 'error' status carries a message; everything else clears it.
      last_error: status === 'error' ? lastError : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin()
      .from('connectors')
      .upsert(row, { onConflict: 'function_id,type' });
    return error ? fail(error.message ?? 'connector status upsert failed') : ok;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'connector status upsert failed');
  }
}

/**
 * Merge non-secret config into config_jsonb and (optionally) set a status. Upserts on
 * (function_id, type). The merge is shallow — callers pass the full intended config.
 */
export async function upsertConfig(
  functionId: string,
  type: ConnectorType,
  config: Record<string, unknown>,
  status?: ConnectorStatus,
): Promise<WriteResult> {
  try {
    const existing = await getConnectorRecord(functionId, type);
    const merged = { ...(existing?.config_jsonb ?? {}), ...config };
    const row: Record<string, unknown> = {
      function_id: functionId,
      type,
      config_jsonb: merged,
      status: status ?? existing?.status ?? 'connected',
      updated_at: new Date().toISOString(),
    };
    // Clear stale errors when we (re)configure to a non-error state.
    if ((status ?? existing?.status) !== 'error') row.last_error = null;
    const { error } = await admin()
      .from('connectors')
      .upsert(row, { onConflict: 'function_id,type' });
    return error ? fail(error.message ?? 'connector config upsert failed') : ok;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'connector config upsert failed');
  }
}

/** Stamp last_sync_at = now and set status to 'connected', clearing last_error. */
export async function touchLastSync(
  functionId: string,
  type: ConnectorType,
): Promise<WriteResult> {
  try {
    const row = {
      function_id: functionId,
      type,
      status: 'connected' as ConnectorStatus,
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin()
      .from('connectors')
      .upsert(row, { onConflict: 'function_id,type' });
    return error ? fail(error.message ?? 'connector touchLastSync failed') : ok;
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'connector touchLastSync failed');
  }
}
