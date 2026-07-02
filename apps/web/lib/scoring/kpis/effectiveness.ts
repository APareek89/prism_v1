// lib/scoring/kpis/effectiveness.ts
//
// Effectiveness KPIs (PRD §4.2). Two inverted (change-failure, defect-rework).
// AI-rate denominators use AI-linked PRs only; self-reverts are excluded
// (anti-gaming, PRD §4.7). Values null when there is no denominator.
//
//   merged_without_revert_rate = 1 − (AI PRs reverted ≤14d ÷ AI merged PRs)        ↑
//   ai_code_retention_30d      = AI lines alive at 30d ÷ AI lines merged           ↑
//   change_failure_rate        = failed AI deploys ÷ AI deploys                    ↓ (inv)
//   defect_rework_rate         = fix follow-ups on same hunks ≤14d ÷ merged PRs    ↓ (inv)

import type { KpiRaw, MemberRawRows } from '../types';
import { safeDiv, sum } from '../math';

/** Merged-without-revert rate: 1 − (AI PRs reverted ≤14d ÷ AI merged PRs).
 *  Self-reverts are excluded from the revert numerator (anti-gaming). */
export function mergedWithoutRevertRate(rows: MemberRawRows): KpiRaw {
  const aiMerged = rows.prs.filter((p) => p.isMerged && p.aiLinked);
  const reverted = aiMerged.filter(
    (p) => p.revertedWithin14d && !p.isSelfRevert,
  );
  const revertRate = safeDiv(reverted.length, aiMerged.length);
  return {
    kpiId: 'merged_without_revert_rate',
    dimension: 'effectiveness',
    value: revertRate === null ? null : 1 - revertRate,
    signals: aiMerged.length,
  };
}

/** AI-code retention @30d: AI lines alive at 30d ÷ AI lines merged. */
export function aiCodeRetention30d(rows: MemberRawRows): KpiRaw {
  const aiMerged = rows.prs.filter((p) => p.isMerged && p.aiLinked);
  const linesMerged = sum(aiMerged.map((p) => p.aiLinesMerged));
  const linesAlive = sum(aiMerged.map((p) => p.aiLinesAliveAt30d));
  return {
    kpiId: 'ai_code_retention_30d',
    dimension: 'effectiveness',
    value: safeDiv(linesAlive, linesMerged),
    // signals = AI PRs that actually merged AI lines (outcome-bearing).
    signals: aiMerged.filter((p) => p.aiLinesMerged > 0).length,
  };
}

/** Change-failure rate (AI-assisted): failed AI deploys ÷ AI deploys. Inverted. */
export function changeFailureRate(rows: MemberRawRows): KpiRaw {
  const aiDeploys = rows.deploys.filter((d) => d.aiAssisted);
  const failed = aiDeploys.filter((d) => d.changeFailed);
  return {
    kpiId: 'change_failure_rate',
    dimension: 'effectiveness',
    value: safeDiv(failed.length, aiDeploys.length),
    signals: aiDeploys.length,
  };
}

/** Defect-driven rework rate: fix-type follow-ups on same hunks ≤14d ÷ merged PRs.
 *  Inverted. Denominator is all merged PRs (PRD §4.2). */
export function defectReworkRate(rows: MemberRawRows): KpiRaw {
  const merged = rows.prs.filter((p) => p.isMerged);
  const rework = merged.filter((p) => p.defectReworkWithin14d);
  return {
    kpiId: 'defect_rework_rate',
    dimension: 'effectiveness',
    value: safeDiv(rework.length, merged.length),
    signals: merged.length,
  };
}

/** All Effectiveness KPIs for one member. */
export function effectivenessKpis(rows: MemberRawRows): KpiRaw[] {
  return [
    mergedWithoutRevertRate(rows),
    aiCodeRetention30d(rows),
    changeFailureRate(rows),
    defectReworkRate(rows),
  ];
}
