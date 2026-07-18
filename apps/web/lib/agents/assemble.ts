// lib/agents/assemble.ts
//
// Build the deterministic InsightState for one scope on a run date — the NUMBERS half
// of the determinism boundary. Everything the agents narrate (rankings, est_impact,
// deltas, strengths, PR verdict signals, evidence values) is read from the computed
// tables (index_daily / kpi_daily) and the raw evidence tables (gh_prs, cc_sessions,
// pr_ai_link) HERE, in code — the LLM never computes any of it.
//
// Reads via the SERVICE-ROLE admin client (RLS-bypassing pipeline path). No fabricated
// numbers: when a scope has no computed rows the state is empty (band L0, l1 null,
// empty areas/deltas/evidence) and the graph simply emits nothing.
//
// SERVER-ONLY.

import { createAdminClient } from '@/lib/supabase/admin';
import type { Dimension, Band, ConfidenceBand, KpiId, KpiAnchor } from '@/lib/scoring/types';
import type { EvidenceRow, PrVerdict } from '@/lib/types/agents';
import { DEFAULT_INDEX_CONFIG } from '@/lib/scoring/defaults/index-config.default';
import type { InsightStateType, ValueVsAnchor, DeltaRow, PrRecord } from './state';
import { classifyPr } from './nodes/pr-classify';

// ─────────────────────────────────────────────────────────────────────────────
// Loose admin query surface (same cast pattern as lib/pipeline/assemble.ts)
// ─────────────────────────────────────────────────────────────────────────────
type DbResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface LooseChain extends DbResult {
  eq: (col: string, val: unknown) => LooseChain;
  in: (col: string, vals: readonly unknown[]) => LooseChain;
  gte: (col: string, val: unknown) => LooseChain;
  lte: (col: string, val: unknown) => LooseChain;
  order: (col: string, opts?: unknown) => LooseChain;
  limit: (n: number) => LooseChain;
  select: (cols: string) => LooseChain;
}
interface LooseDb {
  from: (table: string) => LooseChain;
}
function looseDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}
function rows(result: { data: unknown; error: unknown }): Record<string, unknown>[] {
  if (result.error) {
    const message = typeof result.error === 'object' && result.error && 'message' in result.error
      ? String((result.error as { message?: unknown }).message ?? 'database query failed')
      : String(result.error);
    throw new Error(message);
  }
  if (!Array.isArray(result.data)) return [];
  return result.data as Record<string, unknown>[];
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function num(v: unknown): number {
  return numOrNull(v) ?? 0;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function bool(v: unknown): boolean {
  return v === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI → dimension + anchor lookup (from the canonical scoring defaults)
// ─────────────────────────────────────────────────────────────────────────────

const KPI_DIMENSION: Record<KpiId, Dimension> = {
  ai_assisted_pr_share: 'usage',
  agentic_depth_share: 'usage',
  tool_session_cadence: 'usage',
  ai_iterations_to_merge: 'efficiency',
  suggestion_acceptance_rate: 'efficiency',
  tokens_to_shipped: 'efficiency',
  merged_without_revert_rate: 'effectiveness',
  ai_code_retention_30d: 'effectiveness',
  change_failure_rate: 'effectiveness',
  defect_rework_rate: 'effectiveness',
  effective_skill_leverage: 'proficiency',
  distinct_skills_authored: 'proficiency',
  multiplier_signal: 'proficiency',
};

export interface NarrativeConfig {
  configVersion: string;
  weights: Record<Dimension, number>;
  anchors: Record<KpiId, KpiAnchor>;
}

/** Load the exact versioned weights/anchors stamped on this function/date score run. */
export async function loadNarrativeConfig(functionId: string, date: string): Promise<NarrativeConfig> {
  const scored = rows(
    await looseDb()
      .from('index_daily')
      .select('config_version,function_id,scope,scope_id,date')
      .eq('function_id', functionId)
      .eq('scope', 'function')
      .eq('scope_id', functionId)
      .eq('date', dayOnly(date))
      .limit(1),
  )[0];
  const scoredVersion = num(scored?.config_version);
  if (scoredVersion <= 0) throw new Error('scored function row has no valid configuration version');
  const result = rows(
    await looseDb()
      .from('index_config')
      .select('version,weights_jsonb,anchors_jsonb,function_id')
      .eq('function_id', functionId)
      .eq('version', scoredVersion)
      .limit(1),
  )[0];
  if (!result) throw new Error(`index configuration v${scoredVersion} is unavailable for insight ranking`);

  const rawWeights = object(result.weights_jsonb);
  const rawAnchors = object(result.anchors_jsonb);
  const dimensions: Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];
  const weights = Object.fromEntries(dimensions.map((dimension) => {
    const configured = numOrNull(rawWeights[dimension]);
    return [dimension, configured !== null && configured >= 0 ? configured : DEFAULT_INDEX_CONFIG.weights[dimension]];
  })) as Record<Dimension, number>;
  const anchors = Object.fromEntries((Object.keys(KPI_DIMENSION) as KpiId[]).map((kpiId) => {
    const configured = object(rawAnchors[kpiId]);
    const fallback = DEFAULT_INDEX_CONFIG.anchors[kpiId];
    return [kpiId, {
      target: numOrNull(configured.target) ?? fallback.target,
      ...(fallback.floor !== undefined || configured.floor !== undefined ? { floor: numOrNull(configured.floor) ?? fallback.floor } : {}),
      ...(fallback.ceil !== undefined || configured.ceil !== undefined ? { ceil: numOrNull(configured.ceil) ?? fallback.ceil } : {}),
    }];
  })) as Record<KpiId, KpiAnchor>;
  return { configVersion: `v${scoredVersion}`, weights, anchors };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Anchor floor/target for a KPI from the canonical defaults (used for the gap ranking). */
function anchorFor(kpiId: KpiId, config: NarrativeConfig): { floor: number; target: number } {
  const a = config.anchors[kpiId];
  if (!a) return { floor: 0, target: 100 };
  // Inverted KPIs store target/ceil; use target as the "good" point either way, and the
  // opposite endpoint as the "floor" reference for the gap.
  const floor = a.floor ?? a.ceil ?? 0;
  return { floor, target: a.target };
}

// ─────────────────────────────────────────────────────────────────────────────
// index_daily / kpi_daily reads for a scope
// ─────────────────────────────────────────────────────────────────────────────

interface IndexDailyLite {
  date: string;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  band: string | null;
  confidence: string | null;
  tokens_per_pr: number | null;
}

/** All index_daily rows for the scope, newest first (bounded). */
async function loadIndexRows(scope: string, scopeId: string): Promise<IndexDailyLite[]> {
  const db = looseDb();
  const raw = rows(
    await db
      .from('index_daily')
      .select(
        'date, l1, l2_usage, l2_eff, l2_effness, l2_prof, band, confidence, tokens_per_pr, scope, scope_id',
      )
      .eq('scope', scope)
      .eq('scope_id', scopeId)
      .order('date', { ascending: false })
      .limit(60),
  );
  return raw.map((r) => ({
    date: String(r.date),
    l1: numOrNull(r.l1),
    l2_usage: numOrNull(r.l2_usage),
    l2_eff: numOrNull(r.l2_eff),
    l2_effness: numOrNull(r.l2_effness),
    l2_prof: numOrNull(r.l2_prof),
    band: str(r.band),
    confidence: str(r.confidence),
    tokens_per_pr: numOrNull(r.tokens_per_pr),
  }));
}

interface KpiDailyLite {
  kpi_id: string;
  raw_value: number | null;
  norm_score: number | null;
  signal_count: number;
  provenance: 'employee' | 'organization_aggregate';
  sample_size?: number;
  population_size?: number;
}

/** The latest-date kpi_daily rows for the scope (matched to the latest index_daily date). */
async function loadKpiRows(scope: string, scopeId: string, date: string): Promise<KpiDailyLite[]> {
  if (scope === 'function') return loadOrganizationKpiRows(scopeId, date);
  const db = looseDb();
  const raw = rows(
    await db
      .from('kpi_daily')
      .select('kpi_id, raw_value, norm_score, signal_count, scope, scope_id, date')
      .eq('scope', scope)
      .eq('scope_id', scopeId)
      .eq('date', date),
  );
  return raw.map((r) => ({
    kpi_id: String(r.kpi_id),
    raw_value: numOrNull(r.raw_value),
    norm_score: numOrNull(r.norm_score),
    signal_count: num(r.signal_count),
    provenance: 'employee',
  }));
}

/**
 * The scoring pipeline intentionally does not manufacture function-scope KPI rows.
 * Organization narration therefore consumes a privacy-safe aggregation of the latest
 * real employee KPI rows: median score/raw value, summed signals, and explicit coverage.
 * No employee id or employee narrative enters the organization prompt.
 */
async function loadOrganizationKpiRows(functionId: string, date: string): Promise<KpiDailyLite[]> {
  const db = looseDb();
  const [employeeResult, kpiResult] = await Promise.all([
    db.from('employees').select('id, active, function_id').eq('function_id', functionId).eq('active', true),
    db.from('kpi_daily').select('kpi_id, raw_value, norm_score, signal_count, scope, scope_id, function_id, date')
      .eq('function_id', functionId).eq('scope', 'employee').eq('date', date),
  ]);
  const employees = rows(employeeResult);
  const populationSize = employees.length;
  const activeIds = new Set(employees.map((employee) => String(employee.id)));
  const grouped = new Map<string, Record<string, unknown>[]>();
  for (const row of rows(kpiResult)) {
    if (!activeIds.has(String(row.scope_id)) || numOrNull(row.norm_score) === null || num(row.signal_count) <= 0) continue;
    const id = String(row.kpi_id);
    grouped.set(id, [...(grouped.get(id) ?? []), row]);
  }
  return Array.from(grouped.entries()).map(([kpiId, group]) => ({
    kpi_id: kpiId,
    raw_value: median(group.map((row) => numOrNull(row.raw_value)).filter((value): value is number => value !== null)),
    norm_score: median(group.map((row) => numOrNull(row.norm_score)).filter((value): value is number => value !== null)),
    signal_count: group.reduce((sum, row) => sum + num(row.signal_count), 0),
    provenance: 'organization_aggregate',
    sample_size: new Set(group.map((row) => String(row.scope_id))).size,
    population_size: populationSize,
  }));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic derivations (the NUMBERS)
// ─────────────────────────────────────────────────────────────────────────────

const L2_KEY: Record<Dimension, keyof IndexDailyLite> = {
  usage: 'l2_usage',
  efficiency: 'l2_eff',
  effectiveness: 'l2_effness',
  proficiency: 'l2_prof',
};

function bandOf(v: string | null): Band {
  const b = (v ?? 'L0') as Band;
  return (['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const).includes(b) ? b : 'L0';
}
function confBandOf(v: string | null): ConfidenceBand {
  const c = (v ?? 'insufficient') as ConfidenceBand;
  return (['high', 'medium', 'low', 'insufficient'] as const).includes(c) ? c : 'insufficient';
}
function confScore(band: ConfidenceBand): number {
  return band === 'high' ? 0.75 : band === 'medium' ? 0.55 : band === 'low' ? 0.4 : 0;
}

/** Build value-vs-anchor rows from the latest kpi_daily rows (with real signal only). */
function buildValuesVsAnchor(kpis: KpiDailyLite[], config: NarrativeConfig): ValueVsAnchor[] {
  return kpis
    .filter((k) => k.kpi_id in KPI_DIMENSION)
    .map((k) => {
      const kpiId = k.kpi_id as KpiId;
      const dimension = KPI_DIMENSION[kpiId];
      const { floor, target } = anchorFor(kpiId, config);
      return {
        kpiId,
        dimension,
        raw: k.raw_value,
        norm: k.norm_score,
        floor,
        target,
        weight: config.weights[dimension],
        metMinSignal: k.signal_count > 0,
        provenance: k.provenance,
        sampleSize: k.sample_size,
        populationSize: k.population_size,
      };
    });
}

/**
 * Rank the improvement areas: KPIs with a real normalized score below 100, ordered by
 * modeled impact = (100 − norm) × dimension weight (bigger gap on a heavier dimension
 * ranks first). Est-impact per item = that same product, rounded — this is the number
 * the read layer shows and the LLM is NOT allowed to invent.
 */
export function rankImprovements(
  values: ValueVsAnchor[],
  limit = 5,
): Array<{ area: ValueVsAnchor; estImpact: number }> {
  return values
    .filter((v) => v.norm !== null && v.norm < 100 && v.metMinSignal)
    .map((v) => ({ area: v, estImpact: round1((100 - (v.norm as number)) * v.weight) }))
    .filter((x) => x.estImpact > 0)
    .sort((a, b) => b.estImpact - a.estImpact)
    .slice(0, limit);
}

/** Strengths: KPIs at/above target-equivalent (norm >= 80) with signal, strongest first. */
export function rankStrengths(values: ValueVsAnchor[], limit = 4): ValueVsAnchor[] {
  return values
    .filter((v) => v.norm !== null && v.norm >= 80 && v.metMinSignal)
    .sort((a, b) => (b.norm as number) - (a.norm as number))
    .slice(0, limit);
}

/**
 * Compute the L1 + per-L2 deltas between the latest row and a baseline row `offset`
 * days back (chosen as the first row on/before latest.date − offset, else the oldest).
 * Direction + amount are computed here — the LLM only narrates them.
 */
export function computeDeltas(indexRows: IndexDailyLite[], offset: number): DeltaRow[] {
  if (indexRows.length === 0) return [];
  const latest = indexRows[0]!;
  const baseline = pickBaseline(indexRows, offset);
  if (!baseline) return [];

  const out: DeltaRow[] = [];
  // L1
  out.push(makeDelta('l1', null, latest.l1, baseline.l1));
  // each L2
  for (const d of ['usage', 'efficiency', 'effectiveness', 'proficiency'] as Dimension[]) {
    const key = L2_KEY[d];
    out.push(makeDelta(d, d, latest[key] as number | null, baseline[key] as number | null));
  }
  // Only surface movements that actually moved (non-null, non-zero delta).
  return out.filter((r) => r.delta !== null && Math.abs(r.delta) >= 0.5);
}

function makeDelta(
  key: Dimension | 'l1',
  dimension: Dimension | null,
  latest: number | null,
  baseline: number | null,
): DeltaRow {
  const delta = latest !== null && baseline !== null ? round1(latest - baseline) : null;
  const direction: DeltaRow['direction'] =
    delta === null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return { key, dimension, latest, baseline, delta, direction };
}

function pickBaseline(indexRows: IndexDailyLite[], offset: number): IndexDailyLite | null {
  if (indexRows.length < 2) return null;
  const latest = indexRows[0]!;
  const cutoff = isoMinus(latest.date, offset);
  for (const r of indexRows) {
    if (r.date <= cutoff) return r;
  }
  return indexRows[indexRows.length - 1] ?? null;
}

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return new Date(d.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence rows (the ONLY ids the LLM may cite)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the evidence set from the computed KPIs + the movements. Each id is stable and
 * carries the dimension so the mock model / grounding can match on it. Value is the real
 * number the LLM is allowed to quote.
 */
export function buildEvidence(values: ValueVsAnchor[], deltas: DeltaRow[]): EvidenceRow[] {
  const ev: EvidenceRow[] = [];
  const aggregateScope = values.some((value) => value.provenance === 'organization_aggregate');
  for (const v of values) {
    if (v.norm === null) continue;
    const prefix = v.provenance === 'organization_aggregate' ? 'org-kpi' : 'kpi';
    ev.push({
      id: `${prefix}:${v.kpiId}:${v.dimension}`,
      label: `${v.kpiId} ${v.provenance === 'organization_aggregate' ? 'organization median' : 'normalized'} (${v.dimension})`,
      value: v.norm,
      source: v.provenance ?? 'employee',
    });
    if (v.raw !== null) {
      ev.push({ id: `${prefix}-raw:${v.kpiId}:${v.dimension}`, label: `${v.kpiId} raw ${v.provenance === 'organization_aggregate' ? 'median' : 'value'}`, value: v.raw, source: v.provenance ?? 'employee' });
    }
    if (v.provenance === 'organization_aggregate' && v.sampleSize !== undefined && v.populationSize !== undefined) {
      ev.push({ id: `org-coverage:${v.kpiId}`, label: `${v.kpiId} contributing people`, value: `${v.sampleSize} of ${v.populationSize}`, source: 'organization_aggregate' });
    }
  }
  for (const d of deltas) {
    if (d.delta === null) continue;
    const key = d.dimension ?? 'l1';
    ev.push({
      id: `delta:${key}`,
      label: `${key} change vs baseline`,
      value: d.delta,
      source: aggregateScope ? 'organization_aggregate' : 'employee',
    });
  }
  return ev;
}

// ─────────────────────────────────────────────────────────────────────────────
// PR records (for the pr-level graph; verdict decided in code)
// ─────────────────────────────────────────────────────────────────────────────

interface PrDbLite {
  id: string;
  files: number;
  hunks: number;
  modules: number;
  is_merged: boolean;
  ai_assisted: boolean;
  merged_at: string | null;
  reverted_at: string | null;
}

const DAY_MS = 86_400_000;

/** Load recent merged PRs for a function + map each to a classified PrRecord. */
async function loadPrRecords(functionId: string, date: string): Promise<PrRecord[]> {
  const db = looseDb();
  const since = new Date(Date.parse(`${date}T23:59:59Z`) - 28 * DAY_MS).toISOString();
  const until = new Date(Date.parse(`${date}T23:59:59Z`)).toISOString();
  // NOTE: agentic_majority / defect_rework_within_14d / is_self_revert are M3 per-PR
  // detectors that have NO column in the current schema (0007). Selecting them would
  // error; per the no-dummy-data rule they are honest no-signal `false` here (mirrors
  // lib/pipeline/assemble.ts). The `ai_slop` verdict therefore stays inert until M3
  // wires those signals — that is correct, not a gap to paper over.
  const raw = rows(
    await db
      .from('gh_prs')
      .select(
        'id, number, files, hunks, modules, is_merged, ai_assisted, merged_at, reverted_at, function_id',
      )
      .eq('function_id', functionId)
      .eq('is_merged', true)
      .gte('merged_at', since)
      .lte('merged_at', until)
      .order('merged_at', { ascending: false })
      .limit(50),
  );
  // Iterations proxy: turns on sessions linked to the PR. Load once, group by linked_pr.
  const sessRaw = rows(
    await db
      .from('cc_sessions')
      .select('linked_pr, turns, function_id')
      .eq('function_id', functionId),
  );
  const iterByPr = new Map<string, number>();
  for (const s of sessRaw) {
    const pr = str(s.linked_pr);
    if (!pr) continue;
    iterByPr.set(pr, (iterByPr.get(pr) ?? 0) + num(s.turns));
  }

  return raw.map((r) => {
    const prId = String(r.id);
    const mergedMs = r.merged_at ? Date.parse(String(r.merged_at)) : null;
    const revertedMs = r.reverted_at ? Date.parse(String(r.reverted_at)) : null;
    const revertedWithin14d =
      revertedMs !== null && mergedMs !== null && revertedMs - mergedMs <= 14 * DAY_MS;
    const signals = {
      aiLinked: bool(r.ai_assisted),
      isMerged: bool(r.is_merged),
      revertedWithin14d,
      // M3-pending per-PR detectors — no column yet, honest no-signal false (not fabricated).
      isSelfRevert: false,
      agenticMajority: false,
      defectReworkWithin14d: false,
      aiIterations: iterByPr.get(prId) ?? 0,
      sizeBucket: sizeBucketFor(num(r.files), num(r.hunks), num(r.modules)),
    };
    const verdict: PrVerdict = classifyPr(signals);
    const number = numOrNull(r.number);
    return {
      prId,
      ref: number !== null ? `#${number}` : prId,
      sizeBucket: signals.sizeBucket,
      aiLinked: signals.aiLinked,
      revertedWithin14d: signals.revertedWithin14d,
      isSelfRevert: signals.isSelfRevert,
      agenticMajority: signals.agenticMajority,
      defectReworkWithin14d: signals.defectReworkWithin14d,
      aiIterations: signals.aiIterations,
      isMerged: signals.isMerged,
      verdict,
    };
  });
}

/** Cheap size bucket from raw diff signals (cold-start cutoffs; sizing engine owns the real one). */
function sizeBucketFor(files: number, hunks: number, modules: number): 'S' | 'M' | 'L' {
  const score = files + hunks + 2 * modules;
  const { sMax, lMin } = DEFAULT_INDEX_CONFIG.sizing.coldStart;
  if (score <= sMax) return 'S';
  if (score >= lMin) return 'L';
  return 'M';
}

// ─────────────────────────────────────────────────────────────────────────────
// The public assemblers
// ─────────────────────────────────────────────────────────────────────────────

export interface AssembledScope {
  state: InsightStateType;
  /** the ranked improvements with est_impact (persisted by run.ts; not on the LLM). */
  rankedImprovements: Array<{ area: ValueVsAnchor; estImpact: number }>;
  /** the ranked strengths (attribution). */
  strengths: ValueVsAnchor[];
  /** whether this scope has enough signal to run the graph at all. */
  hasSignal: boolean;
}

/** ISO date string a run.ts caller passed may include time; normalize to YYYY-MM-DD. */
function dayOnly(date: string): string {
  return date.slice(0, 10);
}

/**
 * Assemble the InsightState + the deterministic side-tables for a scope (function or
 * employee) on a run date. The state carries only real computed numbers; when there is
 * no latest index row the scope is signal-less and the caller skips it.
 */
export async function assembleScope(
  functionId: string,
  scope: 'function' | 'employee',
  scopeId: string,
  date: string,
  config: NarrativeConfig,
): Promise<AssembledScope> {
  const indexRows = await loadIndexRows(scope, scopeId);
  const latest = indexRows[0] ?? null;

  const l2: Record<Dimension, number | null> = {
    usage: latest?.l2_usage ?? null,
    efficiency: latest?.l2_eff ?? null,
    effectiveness: latest?.l2_effness ?? null,
    proficiency: latest?.l2_prof ?? null,
  };

  const kpis = latest ? await loadKpiRows(scope, scopeId, latest.date) : [];
  const values = buildValuesVsAnchor(kpis, config);
  const deltas = computeDeltas(indexRows, 7);
  const evidence = buildEvidence(values, deltas);
  const rankedImprovements = rankImprovements(values, scope === 'function' ? 3 : 5);
  const strengths = rankStrengths(values, scope === 'function' ? 3 : 4);

  const confidenceBand = confBandOf(latest?.confidence ?? null);

  const state: InsightStateType = {
    scope,
    scopeId,
    date: dayOnly(date),
    configVersion: config.configVersion,
    l1: latest?.l1 ?? null,
    l2,
    band: bandOf(latest?.band ?? null),
    confidence: confScore(confidenceBand),
    confidenceBand,
    valuesVsAnchor: values,
    deltas,
    evidence,
    prRecords: [],
    tokensPerPr: latest?.tokens_per_pr ?? null,
    insights: [],
    drivers: [],
    prLevel: [],
  };

  const hasSignal = latest !== null && values.length > 0;
  return { state, rankedImprovements, strengths, hasSignal };
}

/**
 * Assemble the PR-level state for a function on a run date: recent classified PRs (verdict
 * in code) + the per-PR evidence the narrator may cite. Employee-scoped (each PR carries
 * its author employee_id via gh_prs, but the pr_level insight is written per employee in
 * run.ts using the PR's own scope).
 */
export async function assemblePrLevel(
  functionId: string,
  date: string,
  configVersion: string,
): Promise<{ state: InsightStateType; prRecords: PrRecord[] }> {
  const prRecords = await loadPrRecords(functionId, date);
  const evidence: EvidenceRow[] = [];
  for (const pr of prRecords) {
    evidence.push({ id: `pr:${pr.prId}:iterations`, label: `${pr.ref} AI iterations`, value: pr.aiIterations });
    evidence.push({ id: `pr:${pr.prId}:size`, label: `${pr.ref} size bucket`, value: pr.sizeBucket });
    evidence.push({ id: `pr:${pr.prId}:verdict`, label: `${pr.ref} verdict`, value: pr.verdict });
  }
  const state: InsightStateType = {
    scope: 'function',
    scopeId: functionId,
    date: dayOnly(date),
    configVersion,
    l1: null,
    l2: { usage: null, efficiency: null, effectiveness: null, proficiency: null },
    band: 'L0',
    confidence: 0,
    confidenceBand: 'insufficient',
    valuesVsAnchor: [],
    deltas: [],
    evidence,
    prRecords,
    tokensPerPr: null,
    insights: [],
    drivers: [],
    prLevel: [],
  };
  return { state, prRecords };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
