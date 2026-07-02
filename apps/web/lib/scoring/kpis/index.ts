// lib/scoring/kpis/index.ts
//
// Per-member KPI aggregator: runs all 12 KPI formulas and returns their raw values
// + signal counts (PRD §4.2). The PR→bucket map (from sizing.ts) is threaded in for
// the within-S/M/L iterations KPI.

import type { KpiId, KpiRaw, MemberRawRows } from '../types';
import { usageKpis } from './usage';
import { efficiencyKpis, type PrBucketMap } from './efficiency';
import { effectivenessKpis } from './effectiveness';
import { proficiencyKpis } from './proficiency';

export * from './usage';
export * from './efficiency';
export * from './effectiveness';
export * from './proficiency';
export type { PrBucketMap } from './efficiency';

/** Compute all 12 raw KPIs for one member. */
export function computeMemberKpis(
  rows: MemberRawRows,
  prBucket: PrBucketMap,
): KpiRaw[] {
  return [
    ...usageKpis(rows),
    ...efficiencyKpis(rows, prBucket),
    ...effectivenessKpis(rows),
    ...proficiencyKpis(rows),
  ];
}

/** Index the raw KPIs by id for downstream lookup. */
export function indexKpis(kpis: readonly KpiRaw[]): Record<KpiId, KpiRaw> {
  const out = {} as Record<KpiId, KpiRaw>;
  for (const k of kpis) out[k.kpiId] = k;
  return out;
}
