// lib/scoring/kpis/usage.ts
//
// Usage / AI-depth KPIs (PRD §4.2). All three return a raw value + a signal count
// for confidence. Values are null when there is no denominator (no fabricated
// rates). AI-rate denominators exclude BYO/unmatched sessions (anti-gaming).
//
//   ai_assisted_pr_share   = merged PRs with a linked AI session ÷ merged PRs            ↑
//   agentic_depth_share    = merged PRs where ≥50% accepted hunks are AI ÷ merged PRs    ↑
//   tool_session_cadence   = active coding-days with a CC session ÷ working days          ↑

import type { KpiRaw, MemberRawRows } from '../types';
import { safeDiv } from '../math';

/** AI-assisted PR share: merged PRs with a confirmed AI→PR link ÷ merged PRs. */
export function aiAssistedPrShare(rows: MemberRawRows): KpiRaw {
  const merged = rows.prs.filter((p) => p.isMerged);
  const aiLinked = merged.filter((p) => p.aiLinked);
  return {
    kpiId: 'ai_assisted_pr_share',
    dimension: 'usage',
    value: safeDiv(aiLinked.length, merged.length),
    signals: merged.length,
  };
}

/** Agentic-depth share: merged PRs where ≥50% of accepted hunks are AI-originated. */
export function agenticDepthShare(rows: MemberRawRows): KpiRaw {
  const merged = rows.prs.filter((p) => p.isMerged);
  const majority = merged.filter((p) => p.agenticMajority);
  return {
    kpiId: 'agentic_depth_share',
    dimension: 'usage',
    value: safeDiv(majority.length, merged.length),
    signals: merged.length,
  };
}

/** Tool/session cadence: distinct active coding-days with a CC session ÷ working days. */
export function toolSessionCadence(rows: MemberRawRows): KpiRaw {
  const activeDays = new Set(rows.sessions.map((s) => s.day)).size;
  const workingDays = rows.meta.workingDays;
  return {
    kpiId: 'tool_session_cadence',
    dimension: 'usage',
    // value caps at 1 implicitly via cap-at-target during normalization; we keep the
    // raw ratio honest here even if active>working in pathological data.
    value: safeDiv(activeDays, workingDays),
    signals: rows.sessions.length,
  };
}

/** All Usage KPIs for one member. */
export function usageKpis(rows: MemberRawRows): KpiRaw[] {
  return [
    aiAssistedPrShare(rows),
    agenticDepthShare(rows),
    toolSessionCadence(rows),
  ];
}
