// lib/email/data.ts
//
// Assemble the DigestInput for one (employee, date) — the pure DATA layer of the
// daily email digest (A3 / PRD §10.1). This is a PIPELINE read: it uses the
// service-role admin client directly (createAdminClient) rather than the RLS
// `lib/db` reader, because the digest is generated for every employee by the daily
// job, independent of any end-user auth session. Reads only; writes live in outbox.ts.
//
// DETERMINISM BOUNDARY (M4 hard rule): every NUMBER here — L1, the L1 delta, each L2
// score, the vs-squad delta, PR verdict class, est_impact — is read straight from the
// computed tables (index_daily / insights.est_impact) or subtracted in CODE. Nothing
// is invented and no LLM runs in this file. The template only renders these values.
//
// No-dummy-data invariant: when a scope has no index_daily row the numbers are null
// and render.ts suppresses the digest (returns null) — an empty digest is never sent.

import { createAdminClient } from '@/lib/supabase/admin';
import {
  bandLabelFor,
  bandLabelForStored,
  bandBlurbFor,
  confidenceName,
  isSuppressedBand,
  DIMENSIONS,
  DIMENSION_LABEL,
  DIMENSION_TAG,
  L2_COLUMN,
  WINDOW_DAYS,
  type Dimension,
  type DimensionTag,
} from '@/lib/db/_base';
import { DIMENSION_HUES } from '@/app/tokens';
import type { ConfidenceBandName } from '@/lib/ui/view-models';
import { decodePrInsight } from '@/lib/pr-insight';

// ─────────────────────────────────────────────────────────────────────────────
// Public shape — the fully-computed input the template renders. Every number is
// final here (the template does zero math). `null` means "no signal" (— in the UI).
// ─────────────────────────────────────────────────────────────────────────────

export interface DigestSpectrumRow {
  dimension: Dimension;
  tag: DimensionTag;
  label: string; // "Efficiency"
  hue: string; // token hue for the bar
  score: number | null; // 0–100
  vsSquad: number | null; // signed delta vs squad avg (computed in code)
}

export interface DigestPrCallout {
  prNumber: string; // "#421" or "" when unknown
  flag: 'clean' | 're-prompt' | 'revert' | 'ai-slop';
  flagTone: 'ok' | 'warn' | 'bad';
  title: string;
  summary: string;
  tag: DimensionTag;
}

export interface DigestRecommendation {
  title: string; // rec.ref
  body: string; // rec.rationale
  kind: 'skill' | 'process' | 'course';
  tag: DimensionTag;
}

export interface DigestCourse {
  title: string;
  url: string;
  progressPct: number;
  knowledgeCheckPending: boolean;
  statusLabel: string;
}

export interface DigestInput {
  employeeId: string;
  functionId: string;
  name: string;
  toEmail: string | null; // null ⇒ cannot deliver (outbox will skip)
  date: string; // the digest date (ISO yyyy-mm-dd)
  windowLabel: string; // "trailing 28d rolling"

  // header
  l1: number | null;
  l1Delta: number | null; // signed, computed in code (top − baseline)
  band: string | null; // "L3 · Workflow"
  bandBlurb: string | null;
  confidence: ConfidenceBandName;
  suppressed: boolean; // true ⇒ render.ts suppresses the whole digest

  spectrum: DigestSpectrumRow[];
  prCallouts: DigestPrCallout[]; // up to 3
  topRecommendation: DigestRecommendation | null;
  course: DigestCourse | null;

  ctaUrl: string; // "…/me"
}

// ─────────────────────────────────────────────────────────────────────────────
// Loose service-role read surface (generated Database type is an empty placeholder,
// exactly as lib/pipeline/persist.ts does for writes).
// ─────────────────────────────────────────────────────────────────────────────

interface LooseFilter extends Promise<{ data: unknown; error: unknown }> {
  eq: (col: string, val: unknown) => LooseFilter;
  order: (col: string, opts?: unknown) => LooseFilter;
  limit: (n: number) => LooseFilter;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}
interface LooseQuery {
  select: (cols: string) => LooseFilter;
}
interface LooseDb {
  from: (table: string) => LooseQuery;
}
function adminDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

async function rows(f: LooseFilter): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await f;
    if (error || !Array.isArray(data)) return [];
    return data as Record<string, unknown>[];
  } catch {
    return [];
  }
}
async function one(
  fn: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await fn();
    return error ? null : data;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// index_daily reads (employee + squad baseline). Newest-first within the window.
// ─────────────────────────────────────────────────────────────────────────────

interface IndexRow {
  date: string;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  band: string | null;
  confidence: string | null;
}

const INDEX_COLS =
  'date, l1, l2_usage, l2_eff, l2_effness, l2_prof, band, confidence';

/** All index rows for a scope on/before `date`, newest-first. */
async function indexRowsUpTo(
  scope: 'employee' | 'team' | 'function',
  scopeId: string,
  date: string,
): Promise<IndexRow[]> {
  const raw = await rows(
    adminDb()
      .from('index_daily')
      .select(INDEX_COLS)
      .eq('scope', scope)
      .eq('scope_id', scopeId)
      .order('date', { ascending: false }) as LooseFilter,
  );
  return (raw as unknown as IndexRow[]).filter((r) => r.date <= date);
}

/** The row exactly on `date`, else the latest row on/before it (carry-forward). */
function rowForDate(rowset: IndexRow[], date: string): IndexRow | null {
  const exact = rowset.find((r) => r.date === date);
  if (exact) return exact;
  return rowset.length > 0 ? rowset[0]! : null;
}

/** Baseline row ≥ `minGap` days before the top row's date (for the 7-day delta). */
function baselineBefore(rowset: IndexRow[], top: IndexRow, minGap: number): IndexRow | null {
  const cutoff = isoMinus(top.date, minGap);
  for (const r of rowset) {
    if (r.date <= cutoff) return r;
  }
  return null;
}

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

function col(row: IndexRow, dimension: Dimension): number | null {
  const key = L2_COLUMN[dimension] as keyof IndexRow;
  const v = row[key];
  return typeof v === 'number' ? v : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// insights (pr_level call-outs) — narrative from the agent, verdict class from code.
// ─────────────────────────────────────────────────────────────────────────────

interface InsightRow {
  title: string | null;
  body: string | null;
  dimension: string | null;
  rank: number | null;
  evidence_jsonb: unknown;
  created_at: string;
}

async function prLevelInsights(employeeId: string, date: string): Promise<InsightRow[]> {
  const raw = await rows(
    adminDb()
      .from('insights')
      .select('title, body, dimension, rank, evidence_jsonb, created_at, scope, scope_id, kind, date')
      .eq('scope', 'employee')
      .eq('scope_id', employeeId)
      .eq('kind', 'pr_level')
      .eq('date', date)
      .order('rank', { ascending: true }) as LooseFilter,
  );
  return raw as unknown as InsightRow[];
}

function flagTone(flag: DigestPrCallout['flag']): DigestPrCallout['flagTone'] {
  if (flag === 'clean') return 'ok';
  if (flag === 'revert' || flag === 'ai-slop') return 'bad';
  return 'warn';
}
// ─────────────────────────────────────────────────────────────────────────────
// recommendations (top OPEN rec) + course (active assignment)
// ─────────────────────────────────────────────────────────────────────────────

interface RecRow {
  ref: string;
  rationale: string | null;
  kind: string;
  status: string;
  date: string | null;
  created_at: string;
}

async function topOpenRecommendation(employeeId: string): Promise<DigestRecommendation | null> {
  const raw = (await rows(
    adminDb()
      .from('recommendations')
      .select('ref, rationale, kind, status, date, created_at, employee_id')
      .eq('employee_id', employeeId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }) as LooseFilter,
  )) as unknown as RecRow[];

  // "open" = not adopted/dismissed (mirrors the recommendations_open_unique index).
  const open = raw.find((r) => r.status !== 'adopted' && r.status !== 'dismissed');
  if (!open) return null;

  const kind = recKind(open.kind);
  return {
    title: open.ref,
    body: open.rationale ?? '',
    kind,
    tag: recTag(kind),
  };
}
function recKind(kind: string): DigestRecommendation['kind'] {
  if (kind === 'process') return 'process';
  if (kind === 'course') return 'course';
  return 'skill';
}
function recTag(kind: DigestRecommendation['kind']): DimensionTag {
  return kind === 'process' ? 'eff' : 'prof';
}

interface CourseRow {
  course_id: string;
  title: string | null;
  url: string | null;
  progress_pct: number | null;
  status: string;
  knowledge_check_passed_at: string | null;
  created_at: string;
}

async function activeCourse(employeeId: string): Promise<DigestCourse | null> {
  const row = (await one(() =>
    adminDb()
      .from('courses')
      .select('course_id, title, url, progress_pct, status, knowledge_check_passed_at, created_at, employee_id')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )) as CourseRow | null;

  if (!row) return null;
  // Completed courses are not a "nudge" — only surface an assigned / in-progress one.
  if (row.status === 'completed') return null;

  const pct = row.progress_pct ?? 0;
  const kcPending = row.knowledge_check_passed_at === null;
  return {
    title: row.title ?? row.course_id,
    url: row.url ?? `/me/courses/${encodeURIComponent(row.course_id)}`,
    progressPct: pct,
    knowledgeCheckPending: kcPending,
    statusLabel: kcPending ? `${pct}% · knowledge check pending` : `${pct}%`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// employee lookup (name + email + function + squad scope)
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string;
  function_id: string;
  name: string;
  email: string | null;
  active: boolean;
}

async function loadEmployee(employeeId: string): Promise<EmployeeRow | null> {
  return (await one(() =>
    adminDb()
      .from('employees')
      .select('id, function_id, name, email, active')
      .eq('id', employeeId)
      .maybeSingle(),
  )) as EmployeeRow | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildDigestInput — the public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the fully-computed DigestInput for (employee, date). Returns null when the
 * employee is unknown/inactive. All numbers are read/subtracted here; the template does
 * no math. `suppressed` (no index row or below-confidence) tells render.ts to drop it.
 */
export async function buildDigestInput(
  employeeId: string,
  date: string,
  opts?: { appUrl?: string },
): Promise<DigestInput | null> {
  const emp = await loadEmployee(employeeId);
  if (!emp || !emp.active) return null;

  const empRows = await indexRowsUpTo('employee', employeeId, date);
  const top = rowForDate(empRows, date);

  // Squad baseline: the function-scope index row for the same date (the "squad avg"
  // computed by the engine at function scope). Team scope would be identical in the
  // single-team MVP; function is the always-present aggregate.
  const squadRows = await indexRowsUpTo('function', emp.function_id, date);
  const squadTop = squadRows.length > 0 ? rowForDate(squadRows, date) : null;

  const suppressed = !top || isSuppressedBand(top.confidence) || top.l1 === null;
  const l1 = suppressed ? null : (top?.l1 ?? null);
  // Honor the engine's stored band (L0/L5 gates) instead of bucketing by L1 alone.
  const band = !suppressed && top ? (bandLabelForStored(top.band) ?? bandLabelFor(top.l1)) : null;

  let l1Delta: number | null = null;
  if (!suppressed && top) {
    const base = baselineBefore(empRows, top, 7);
    if (base && top.l1 !== null && base.l1 !== null) l1Delta = top.l1 - base.l1;
  }

  const spectrum: DigestSpectrumRow[] = DIMENSIONS.map((d) => {
    const score = top ? col(top, d) : null;
    const squadScore = squadTop ? col(squadTop, d) : null;
    const vsSquad =
      score !== null && squadScore !== null ? round1(score - squadScore) : null;
    return {
      dimension: d,
      tag: DIMENSION_TAG[d],
      label: DIMENSION_LABEL[d],
      hue: DIMENSION_HUES[d],
      score,
      vsSquad,
    };
  });

  const insightRows = await prLevelInsights(employeeId, date);
  const prCallouts: DigestPrCallout[] = insightRows.slice(0, 3).map((row) => {
    const title = row.title ?? '';
    const body = row.body ?? '';
    const decoded = decodePrInsight(row.evidence_jsonb, title, body);
    const flag = decoded.flag;
    return {
      prNumber: decoded.prNumber ?? '',
      flag,
      flagTone: flagTone(flag),
      title,
      summary: body,
      tag: normalizeTag(row.dimension),
    };
  });

  const topRecommendation = await topOpenRecommendation(employeeId);
  const course = await activeCourse(employeeId);

  const appUrl = (opts?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return {
    employeeId,
    functionId: emp.function_id,
    name: emp.name,
    toEmail: emp.email,
    date,
    windowLabel: `trailing ${WINDOW_DAYS}d rolling`,
    l1,
    l1Delta: l1Delta === null ? null : round1(l1Delta),
    band,
    bandBlurb: bandBlurbFor(band),
    confidence: confidenceName(top?.confidence),
    suppressed,
    spectrum,
    prCallouts,
    topRecommendation,
    course,
    ctaUrl: `${appUrl}/me`,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function normalizeTag(dimension: string | null): DimensionTag {
  switch (dimension) {
    case 'efficiency':
      return 'eff';
    case 'effectiveness':
      return 'effness';
    case 'proficiency':
      return 'prof';
    case 'usage':
    default:
      return 'usage';
  }
}
