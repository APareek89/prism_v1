// lib/scoring/compute-daily.ts
//
// Pure orchestration of the deterministic pipeline (architecture §4). Given all
// members' raw rows + config + run date, it runs:
//
//   anti-gaming → sizing → KPIs → normalize → L2/L1 → banding → confidence →
//   tokens/PR → aggregate
//
// and returns ready-to-persist kpi_daily + index_daily payloads. The caller
// persists; this engine stays 100% pure (no I/O, no clock — the run date is passed).
//
// Empty-rows contract: a member with no PRs/sessions yields Insufficient confidence
// + suppressed L1 + L0 band and no fabricated numbers.

import type {
  ComputeDailyResult,
  ConfidenceResult,
  Dimension,
  IndexDailyRow,
  IndexResult,
  KpiDailyRow,
  KpiNormalized,
  MemberRawRows,
  ScoringConfig,
  SizeBucket,
} from './types';
import { resolveScoringConfig, type RawIndexConfig } from './config';
import { applyAntiGaming } from './anti-gaming';
import { freezeThresholds, bucketPr, type SizeThresholds } from './sizing';
import { computeMemberKpis, type PrBucketMap } from './kpis';
import { normalizeKpis } from './normalize';
import { computeAllL2, computeL1 } from './index-score';
import { computeBand } from './banding';
import { computeConfidence, insufficientConfidence } from './confidence';
import { computeTokensPerPr } from './tokens-per-pr';
import { aggregateFunction } from './aggregate';
import { safeDiv } from './math';

const DIMENSIONS: Dimension[] = [
  'usage',
  'efficiency',
  'effectiveness',
  'proficiency',
];

export interface ComputeDailyArgs {
  /** run date 'YYYY-MM-DD' — always passed, never derived from a clock. */
  date: string;
  /** the function being scored (scope_id for the aggregate). */
  functionId: string;
  /** all active members' raw rows for the 28-day compute window. */
  members: MemberRawRows[];
  /**
   * trailing-90-day merged PRs across the repo, used to freeze S/M/L tertiles.
   * Pass [] to use cold-start sizing defaults.
   */
  sizingPrs: ReadonlyArray<MemberRawRows['prs'][number]>;
  /** raw index_config jsonb; omit/undefined → canonical default (cold-start). */
  config?: RawIndexConfig;
}

/** Build the prId→bucket map for one member from frozen thresholds. */
function bucketMapFor(
  rows: MemberRawRows,
  thresholds: SizeThresholds,
  config: ScoringConfig,
): PrBucketMap {
  const map = new Map<string, SizeBucket>();
  for (const pr of rows.prs) {
    map.set(pr.prId, bucketPr(pr, thresholds, config).bucket);
  }
  return map;
}

/** AI-active share for the L0 gate: linked AI merged PRs ÷ merged PRs. */
function aiActiveShare(rows: MemberRawRows): number | null {
  const merged = rows.prs.filter((p) => p.isMerged);
  const aiLinked = merged.filter((p) => p.aiLinked);
  return safeDiv(aiLinked.length, merged.length);
}

/** Total multiplier signal (authored skills reused by ≥1 other). */
function multiplierTotal(rows: MemberRawRows): number {
  return rows.skills.filter((s) => s.usedByOthersCount >= 1).length;
}

/** True when a member contributed no scoreable evidence at all. */
function isEmpty(rows: MemberRawRows): boolean {
  return (
    rows.prs.length === 0 &&
    rows.sessions.length === 0 &&
    rows.deploys.length === 0 &&
    rows.skills.length === 0
  );
}

/** The empty/awaiting-signal IndexResult (no fabricated numbers). */
function emptyMemberResult(
  memberId: string,
  date: string,
  config: ScoringConfig,
): IndexResult {
  const l2 = {} as Record<Dimension, IndexResult['l2'][Dimension]>;
  for (const d of DIMENSIONS) {
    l2[d] = {
      dimension: d,
      score: null,
      signals: 0,
      metMinSignal: false,
      kpis: [],
    };
  }
  const confidence: ConfidenceResult = insufficientConfidence();
  return {
    scope: 'employee',
    scopeId: memberId,
    date,
    configVersion: config.configVersion,
    l1: null,
    l2,
    band: 'L0',
    confidence,
    tokensPerPr: {
      tokensPerPr: null,
      cacheReadShare: null,
      compactionSignal: null,
      mergedPrs: 0,
    },
    aiActiveShare: null,
    multiplierSignal: 0,
  };
}

/** Compute one member's full IndexResult through the pure pipeline. */
function computeMember(
  raw: MemberRawRows,
  thresholds: SizeThresholds,
  config: ScoringConfig,
  cohortSize: number,
  date: string,
): { result: IndexResult; normalized: KpiNormalized[] } {
  const memberId = raw.meta.memberId;

  if (isEmpty(raw)) {
    return { result: emptyMemberResult(memberId, date, config), normalized: [] };
  }

  // 1. anti-gaming guards (drop excluded sessions, void label-spam credit, etc.)
  const rows = applyAntiGaming(raw);

  // 2. sizing → per-PR bucket map (for within-bucket iterations KPI)
  const prBucket = bucketMapFor(rows, thresholds, config);

  // 3. KPIs (raw values + signal counts)
  const rawKpis = computeMemberKpis(rows, prBucket);

  // 4. normalize (anchor → 0–100, invert, cap at target)
  const normalized = normalizeKpis(rawKpis, config);

  // 5. L2 + L1
  const l2 = computeAllL2(normalized, config);
  const l1 = computeL1(l2, config);

  // 6. confidence (cohort-size aware) → may suppress L1
  const confidence = computeConfidence(l2, config, cohortSize);
  const effectiveL1 = confidence.shouldSuppressL1 ? null : l1;

  // 7. banding (L0/L5 gates)
  const share = aiActiveShare(rows);
  const multSignal = multiplierTotal(rows);
  const band = computeBand({
    l1: effectiveL1,
    aiActiveShare: share,
    multiplierSignal: multSignal,
  });

  // 8. tokens/PR cost lens
  const tokensPerPr = computeTokensPerPr(rows);

  const result: IndexResult = {
    scope: 'employee',
    scopeId: memberId,
    date,
    configVersion: config.configVersion,
    l1: effectiveL1,
    l2,
    band,
    confidence,
    tokensPerPr,
    aiActiveShare: share,
    multiplierSignal: multSignal,
  };

  return { result, normalized };
}

/** Flatten a member's normalized KPIs into kpi_daily rows. */
function kpiRowsFor(
  result: IndexResult,
  normalized: readonly KpiNormalized[],
  scopeId: string,
): KpiDailyRow[] {
  return normalized.map((k) => ({
    date: result.date,
    scope: 'employee' as const,
    scopeId,
    kpiId: k.kpiId,
    rawValue: k.value,
    normScore: k.norm,
    signalCount: k.signals,
    confidence: result.confidence.score,
  }));
}

/** Map an IndexResult onto a flat index_daily row. */
function indexRowFor(result: IndexResult): IndexDailyRow {
  return {
    date: result.date,
    scope: result.scope,
    scopeId: result.scopeId,
    l1: result.l1,
    l2Usage: result.l2.usage.score,
    l2Eff: result.l2.efficiency.score,
    l2Effness: result.l2.effectiveness.score,
    l2Prof: result.l2.proficiency.score,
    band: result.band,
    confidence: result.confidence.score,
    confidenceBand: result.confidence.band,
    tokensPerPr: result.tokensPerPr.tokensPerPr,
    configVersion: result.configVersion,
  };
}

/**
 * Run the full deterministic daily computation for one function over N members.
 * Pure — returns ready-to-persist payloads; the caller persists them.
 */
export function computeDaily(args: ComputeDailyArgs): ComputeDailyResult {
  const config = resolveScoringConfig(args.config);
  const date = args.date;
  const cohortSize = args.members.length;

  // Freeze S/M/L thresholds once over the 90-day sizing PRs (shared by all members).
  const thresholds = freezeThresholds(
    args.sizingPrs as MemberRawRows['prs'],
    config,
  );

  const kpiDaily: KpiDailyRow[] = [];
  const memberResults: IndexResult[] = [];

  for (const raw of args.members) {
    const { result, normalized } = computeMember(
      raw,
      thresholds,
      config,
      cohortSize,
      date,
    );
    memberResults.push(result);
    kpiDaily.push(...kpiRowsFor(result, normalized, raw.meta.memberId));
  }

  // Aggregate to function scope (median over members; N=1 is just a 1-element median).
  const functionResult = aggregateFunction(
    memberResults,
    config,
    args.functionId,
    date,
  );

  const indexDaily: IndexDailyRow[] = [
    ...memberResults.map(indexRowFor),
    indexRowFor(functionResult),
  ];

  return {
    kpiDaily,
    indexDaily,
    members: memberResults,
    function: functionResult,
  };
}
