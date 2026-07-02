// lib/db/index-read.ts
//
// The index-scope reads: meta strip, L1 hero + L2 spectrum, the L1 trend, the
// function-only token cost lens, the "Top 5 to improve" list, and "what moved the
// index" drivers. All scoped by (scope, scopeId, period) and parameterized so the
// same code serves the function, a team, or a single employee.
//
// Every read returns a safe empty/awaiting-signal DTO when index_daily / kpi_daily /
// insights have no rows (the schema is live but empty until M3). No fabricated
// numbers: nulls, [], confidence 'Insufficient', suppressed:true.

import type { ScopeKind } from '@/lib/ui/view-models';
import type {
  MetaDTO,
  IndexDTO,
  L2DTO,
  TrendDTO,
  TokenStatsDTO,
  ImprovementDTO,
  DriverDTO,
  Dimension,
} from '@/lib/ui/view-models';
import { DIMENSION_TAG } from '@/lib/ui/view-models';
import type { Period } from '@/lib/config/constants';
import { fmtTokens } from '@/lib/format';
import {
  db,
  selectRows,
  selectOne,
  computeWindow,
  periodView,
  WINDOW_LABEL,
  bandLabelFor,
  bandLabelForStored,
  bandBlurbFor,
  confidenceName,
  confidencePctForBand,
  isSuppressedBand,
  deltaDto,
  DIMENSIONS,
  DIMENSION_LABEL,
  DEFAULT_WEIGHT_PCT,
  L2_COLUMN,
  DIMENSION_HUES,
  type DbReadFilter,
} from './_base';

// ─────────────────────────────────────────────────────────────────────────────
// Internal: fetch the latest + baseline index_daily rows for a scope
// ─────────────────────────────────────────────────────────────────────────────

interface IndexRow {
  date: string;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  band: string | null;
  // `confidence` is the confidence_band enum text (high|medium|low|insufficient) —
  // there is no separate numeric confidence column in the schema.
  confidence: string | null;
  tokens_per_pr: number | null;
  config_version: number | null;
}

/**
 * The window of index_daily rows for a scope, newest-first. Empty when no rows.
 * RLS limits visibility; the loose client + cast keeps this keyless-buildable.
 */
async function indexRows(scope: ScopeKind, scopeId: string): Promise<IndexRow[]> {
  const client = await db();
  const { start } = computeWindow();
  const filter = client
    .from('index_daily')
    .select(
      'date, l1, l2_usage, l2_eff, l2_effness, l2_prof, band, confidence, tokens_per_pr, config_version',
    )
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .order('date', { ascending: false }) as DbReadFilter;
  const raw = await selectRows(filter);
  return (raw as unknown as IndexRow[]).filter((r) => !start || r.date >= start);
}

/** The latest index row (or null). */
function latest(rowset: IndexRow[]): IndexRow | null {
  return rowset.length > 0 ? rowset[0]! : null;
}

/** A baseline row `n` positions back from latest (for the period delta). null when absent. */
function baselineAt(rowset: IndexRow[], offset: number): IndexRow | null {
  return rowset.length > offset ? rowset[offset]! : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// getMeta
// ─────────────────────────────────────────────────────────────────────────────

export async function getMeta(
  scope: ScopeKind,
  scopeId: string,
  period: Period,
  scopeLabel: string = defaultScopeLabel(scope),
): Promise<MetaDTO> {
  const pv = periodView(period);
  const now = new Date();
  const rowset = await indexRows(scope, scopeId);
  const top = latest(rowset);

  // PRs-in-window: count merged PRs for this scope's window when at function/employee
  // scope; null (no signal) when there is nothing to count.
  const prs = await prsInWindow(scope, scopeId);

  return {
    scopeLabel,
    periodLabel: pv.periodLabel(now),
    windowLabel: WINDOW_LABEL,
    prsInWindow: prs,
    confidence: top ? confidenceName(top.confidence) : 'Insufficient',
    confidencePct: top ? confidencePctForBand(top.confidence) : 0,
    updatedAtLabel: top ? top.date : null,
  };
}

function defaultScopeLabel(scope: ScopeKind): string {
  switch (scope) {
    case 'function':
      return 'Function';
    case 'team':
      return 'Team';
    case 'employee':
      return 'My view';
  }
}

/** Count merged gh_prs in the trailing window for a scope. null ⇒ no signal. */
async function prsInWindow(scope: ScopeKind, scopeId: string): Promise<number | null> {
  const client = await db();
  const { start } = computeWindow();
  // function scope counts by function_id; employee scope by employee_id; team has no
  // direct PR key in the raw table (aggregated), so report no count.
  let filter: DbReadFilter;
  if (scope === 'employee') {
    filter = client.from('gh_prs').select('id, merged_at, is_merged').eq('employee_id', scopeId) as DbReadFilter;
  } else if (scope === 'function') {
    filter = client.from('gh_prs').select('id, merged_at, is_merged').eq('function_id', scopeId) as DbReadFilter;
  } else {
    return null;
  }
  const raw = await selectRows(filter);
  if (raw.length === 0) return null;
  const count = (raw as Array<{ is_merged?: boolean; merged_at?: string | null }>).filter(
    (r) => r.is_merged && (!start || (r.merged_at ?? '') >= start),
  ).length;
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// getIndex (L1 hero + L2 spectrum)
// ─────────────────────────────────────────────────────────────────────────────

export async function getIndex(
  scope: ScopeKind,
  scopeId: string,
  period: Period,
): Promise<IndexDTO> {
  const rowset = await indexRows(scope, scopeId);
  const top = latest(rowset);
  const base = baselineAt(rowset, baselineOffset(period));

  if (!top) return emptyIndex();

  const suppressed = isSuppressedBand(top.confidence) || top.l1 === null;
  const l1 = suppressed ? null : top.l1;
  // Honor the engine's stored band (which applies the L0/L5 gates) rather than
  // re-bucketing by L1 alone; fall back to the L1 bucket only if band is missing.
  const band = suppressed ? null : (bandLabelForStored(top.band) ?? bandLabelFor(top.l1));
  const l1Delta = !suppressed && base ? subtract(top.l1, base.l1) : null;

  return {
    l1,
    band,
    bandBlurb: bandBlurbFor(band),
    delta: deltaDto(l1Delta),
    confidence: confidenceName(top.confidence),
    suppressed,
    spectrum: DIMENSIONS.map((d) => l2Dto(d, top, base)),
  };
}

function l2Dto(dimension: Dimension, top: IndexRow, base: IndexRow | null): L2DTO {
  const col = L2_COLUMN[dimension] as keyof IndexRow;
  const score = (top[col] as number | null) ?? null;
  const baseScore = base ? ((base[col] as number | null) ?? null) : null;
  const delta = score !== null && baseScore !== null ? deltaDto(score - baseScore) : null;
  return {
    dimension,
    tag: DIMENSION_TAG[dimension],
    label: DIMENSION_LABEL[dimension],
    weightPct: DEFAULT_WEIGHT_PCT[dimension],
    score,
    delta,
    vsSquad: null, // populated at member/My-view scope by member.ts overlays
    minSignalMet: score !== null,
  };
}

/** The empty/awaiting-signal IndexDTO (no rows yet). */
export function emptyIndex(): IndexDTO {
  return {
    l1: null,
    band: null,
    bandBlurb: null,
    delta: null,
    confidence: 'Insufficient',
    suppressed: true,
    spectrum: DIMENSIONS.map((d) => ({
      dimension: d,
      tag: DIMENSION_TAG[d],
      label: DIMENSION_LABEL[d],
      weightPct: DEFAULT_WEIGHT_PCT[d],
      score: null,
      delta: null,
      vsSquad: null,
      minSignalMet: false,
    })),
  };
}

/** index_daily rows are daily; the baseline offset is the period's lookback in days. */
function baselineOffset(period: Period): number {
  switch (period) {
    case 'daily':
      return 1;
    case 'monthly':
      return 30;
    case 'weekly':
    default:
      return 7;
  }
}

function subtract(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

// ─────────────────────────────────────────────────────────────────────────────
// getTrend (L1 series)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTrend(
  scope: ScopeKind,
  scopeId: string,
  period: Period,
): Promise<TrendDTO> {
  const pv = periodView(period);
  const rowset = await indexRows(scope, scopeId);
  // Chronological order (oldest → newest) for the chart; drop null L1s.
  const series = [...rowset]
    .reverse()
    .map((r) => r.l1)
    .filter((v): v is number => v !== null);

  return {
    series, // [] ⇒ empty-axes awaiting state in TrendChart
    granularityLabel: pv.granularityLabel,
    // Hero L1 line uses ink (matches the reference '#eef1f7'); leave hue undefined.
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getTokenStats (function scope only)
// ─────────────────────────────────────────────────────────────────────────────

export async function getTokenStats(period: Period): Promise<TokenStatsDTO> {
  const { getCurrentFunctionId } = await import('./_base');
  const functionId = await getCurrentFunctionId();
  if (!functionId) return emptyTokenStats();

  const rowset = await indexRows('function', functionId);
  const series = [...rowset]
    .reverse()
    .map((r) => r.tokens_per_pr)
    .filter((v): v is number => v !== null);

  if (series.length === 0) return emptyTokenStats();

  const current = series[series.length - 1]!;
  const base = baselineForTokens(series, period);
  const deltaPct = base && base !== 0 ? Math.round(((current - base) / base) * 100) : null;
  const pv = periodView(period);

  return {
    tokensPerPrLabel: fmtTokens(current),
    deltaLabel:
      deltaPct === null
        ? null
        : `${deltaPct <= 0 ? '▼' : '▲'} ${Math.abs(deltaPct)}% ${pv.deltaBaselineLabel}`,
    costPerPrLabel: costPerPrLabel(current),
    targetLabel: null, // target is a config-derived line; surfaced when config provides it
    series,
  };
}

/** Token bars use the same daily-offset baseline as the index delta. */
function baselineForTokens(series: number[], period: Period): number | null {
  const off = baselineOffset(period);
  const idx = series.length - 1 - off;
  return idx >= 0 ? series[idx]! : null;
}

/** Rough $/PR from tokens/PR (Sonnet-class blended rate placeholder ~$7/Mtok). */
function costPerPrLabel(tokensPerPr: number): string {
  const usd = (tokensPerPr / 1_000_000) * 7;
  return `≈ $${usd.toFixed(2)} / PR`;
}

export function emptyTokenStats(): TokenStatsDTO {
  return {
    tokensPerPrLabel: null,
    deltaLabel: null,
    costPerPrLabel: null,
    targetLabel: null,
    series: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getImprovements ("Top 5 to improve")
// ─────────────────────────────────────────────────────────────────────────────

interface InsightRowLite {
  title: string;
  body: string;
  dimension: string | null;
  est_impact: number | null;
  kind: string;
  created_at: string;
}

export async function getImprovements(
  scope: ScopeKind,
  scopeId: string,
): Promise<ImprovementDTO[]> {
  const insights = await scopeInsights(scope, scopeId, 'improvement');
  return insights.slice(0, 5).map((row, i) => {
    const dim = normalizeDimension(row.dimension);
    return {
      rank: i + 1,
      title: row.title,
      body: row.body,
      dimension: dim ?? 'usage',
      tag: dim ? DIMENSION_TAG[dim] : 'cost',
      impactLabel: impactLabel(row.est_impact, dim),
    };
  });
}

function impactLabel(estImpact: number | null, dim: Dimension | null): string {
  if (estImpact === null) return '';
  const signed = estImpact >= 0 ? `+${Math.round(estImpact)}` : `${Math.round(estImpact)}`;
  return dim ? `${signed} ${DIMENSION_LABEL[dim]}` : `${signed}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// getDrivers ("what moved the index")
// ─────────────────────────────────────────────────────────────────────────────

export async function getDrivers(
  scope: ScopeKind,
  scopeId: string,
  _period: Period,
): Promise<DriverDTO[]> {
  void _period;
  const insights = await scopeInsights(scope, scopeId, 'change');
  return insights.map((row) => {
    const up = (row.est_impact ?? 0) >= 0;
    return {
      dir: up ? 'up' : 'down',
      title: row.title,
      body: row.body,
      amountLabel: amountLabel(row.est_impact),
      amountDir: up ? 'up' : 'down',
    };
  });
}

function amountLabel(estImpact: number | null): string {
  if (estImpact === null) return up0() ? 'good' : 'watch';
  const n = Number(estImpact.toFixed(1));
  return n >= 0 ? `+${n}` : `${n}`;
}
function up0(): boolean {
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// shared insight fetch
// ─────────────────────────────────────────────────────────────────────────────

async function scopeInsights(
  scope: ScopeKind,
  scopeId: string,
  kind: string,
): Promise<InsightRowLite[]> {
  const client = await db();
  // Newest day first (a fresh slot is upserted per pipeline date) + a bound, so the
  // surfaces show the latest run's insights rather than accumulating across days.
  const filter = client
    .from('insights')
    .select('title, body, dimension, est_impact, kind, created_at')
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .eq('kind', kind)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(12) as DbReadFilter;
  const raw = await selectRows(filter);
  return raw as unknown as InsightRowLite[];
}

function normalizeDimension(d: string | null): Dimension | null {
  if (d === 'usage' || d === 'efficiency' || d === 'effectiveness' || d === 'proficiency') return d;
  return null;
}

// Re-export hue map for callers that want to tint a scope-specific trend.
export { DIMENSION_HUES };
