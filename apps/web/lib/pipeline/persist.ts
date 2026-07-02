// lib/pipeline/persist.ts
//
// Persist a ComputeDailyResult into the computed daily tables via the SERVICE-ROLE
// client. Both tables have composite PKs so a daily recompute is an idempotent UPSERT,
// never a duplicate (migration 0011):
//   • kpi_daily   PK (date, scope, scope_id, kpi_id)
//   • index_daily PK (date, scope, scope_id)
//
// Column mapping is validated against the live DB (limit 0). The scoring engine stamps
// configVersion as a string ("v1"); the DB columns are integer, so we parse the digits.
// function_id is NOT NULL on both tables and is denormalized here from the run.
//
// SERVER-ONLY (RLS-bypassing pipeline write). The write helpers live HERE, not in the
// lib/db read modules.

import { createAdminClient } from '@/lib/supabase/admin';
import { bandForScore } from '@/lib/scoring/confidence';
import type {
  ComputeDailyResult,
  IndexDailyRow,
  KpiDailyRow,
} from '@/lib/scoring/types';

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin upsert surface (generated Database type is an empty placeholder).
// ─────────────────────────────────────────────────────────────────────────────
type UpsertResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface LooseTable {
  upsert: (rows: unknown, opts?: { onConflict?: string }) => UpsertResult;
}
interface LooseDb {
  from: (table: string) => LooseTable;
}
function looseDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

/** Parse the integer version out of a config_version string ("v3" → 3; null → 1). */
function versionInt(configVersion: string | null | undefined): number {
  if (!configVersion) return 1;
  const m = String(configVersion).match(/\d+/);
  return m ? Number(m[0]) : 1;
}

export interface PersistResult {
  kpiRows: number;
  indexRows: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mappers: scoring camelCase → DB snake_case
// ─────────────────────────────────────────────────────────────────────────────

interface KpiDailyDb {
  date: string;
  scope: KpiDailyRow['scope'];
  scope_id: string;
  kpi_id: string;
  function_id: string;
  raw_value: number | null;
  norm_score: number | null;
  confidence: number; // numeric carried for the row (kpi_daily.confidence is a band enum, but the row's value is a 0-1 score → mapped below)
  config_version: number;
}

/**
 * Map a scoring KpiDailyRow → the kpi_daily DB row. `confidence` on the scoring row is
 * a 0–1 numeric score; the DB column is a band enum (high|medium|low|insufficient), so
 * we map the score to a band. signal_count carries the per-KPI observation count from the
 * engine (KpiDailyRow.signalCount) — the agent read layer gates on it (metMinSignal).
 */
function toKpiDb(r: KpiDailyRow, functionId: string, configVersion: number): Record<string, unknown> {
  return {
    date: r.date,
    scope: r.scope,
    scope_id: r.scopeId,
    kpi_id: r.kpiId,
    function_id: functionId,
    raw_value: r.rawValue,
    norm_score: r.normScore,
    signal_count: r.signalCount,
    confidence: scoreToBand(r.confidence),
    config_version: configVersion,
  };
}

interface IndexDailyDb {
  date: string;
  scope: IndexDailyRow['scope'];
  scope_id: string;
  function_id: string;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  band: IndexDailyRow['band'];
  confidence: IndexDailyRow['confidenceBand'];
  tokens_per_pr: number | null;
  config_version: number;
}

/** Map a scoring IndexDailyRow → the index_daily DB row. */
function toIndexDb(r: IndexDailyRow, functionId: string): Record<string, unknown> {
  return {
    date: r.date,
    scope: r.scope,
    scope_id: r.scopeId,
    function_id: functionId,
    l1: r.l1,
    l2_usage: r.l2Usage,
    l2_eff: r.l2Eff,
    l2_effness: r.l2Effness,
    l2_prof: r.l2Prof,
    band: r.band,
    confidence: r.confidenceBand,
    tokens_per_pr: r.tokensPerPr,
    config_version: versionInt(r.configVersion),
  };
}

/** 0–1 confidence score → confidence_band enum value, via the scoring engine's own
 *  thresholds (high .75 / medium .55 / low .40) so the band matches index_daily. */
function scoreToBand(score: number): 'high' | 'medium' | 'low' | 'insufficient' {
  if (!Number.isFinite(score)) return 'insufficient';
  return bandForScore(score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write helpers (upsert on the composite PKs)
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert kpi_daily rows on PK (date, scope, scope_id, kpi_id). */
export async function upsertKpiDaily(
  rows: KpiDailyRow[],
  functionId: string,
  configVersion: number,
): Promise<{ written: number; error: string | null }> {
  if (rows.length === 0) return { written: 0, error: null };
  const dbRows = rows.map((r) => toKpiDb(r, functionId, configVersion));
  const { error } = await looseDb()
    .from('kpi_daily')
    .upsert(dbRows, { onConflict: 'date,scope,scope_id,kpi_id' });
  return { written: error ? 0 : dbRows.length, error: error?.message ?? null };
}

/** Upsert index_daily rows on PK (date, scope, scope_id). */
export async function upsertIndexDaily(
  rows: IndexDailyRow[],
  functionId: string,
): Promise<{ written: number; error: string | null }> {
  if (rows.length === 0) return { written: 0, error: null };
  const dbRows = rows.map((r) => toIndexDb(r, functionId));
  const { error } = await looseDb()
    .from('index_daily')
    .upsert(dbRows, { onConflict: 'date,scope,scope_id' });
  return { written: error ? 0 : dbRows.length, error: error?.message ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// persistComputeDaily — the public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a full ComputeDailyResult (member + function rows) for a function. Idempotent
 * upserts on the composite PKs; never throws — errors are collected for the pipeline log.
 */
export async function persistComputeDaily(
  result: ComputeDailyResult,
  functionId: string,
): Promise<PersistResult> {
  const errors: string[] = [];
  const configVersion = versionInt(result.function.configVersion);

  const kpi = await upsertKpiDaily(result.kpiDaily, functionId, configVersion).catch((e) => ({
    written: 0,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (kpi.error) errors.push(`kpi_daily: ${kpi.error}`);

  const index = await upsertIndexDaily(result.indexDaily, functionId).catch((e) => ({
    written: 0,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (index.error) errors.push(`index_daily: ${index.error}`);

  return { kpiRows: kpi.written, indexRows: index.written, errors };
}

export type { KpiDailyDb, IndexDailyDb };
