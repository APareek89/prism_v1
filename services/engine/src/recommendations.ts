// Recommendations — deterministic rules over KPI results + confirmed insights.
// Impact = (100 − KPI score) × the KPI's dimension weight on the MAIN index
// (auditable arithmetic — lab flow step 6). Harness targets are "harness lifts":
// impact = (100 − score) × the KPI's harness weight, noted as protecting the
// main-index KPI the linkage engine ties it to. Channel → owner routing fixed.

import type { IndexConfig, KpiCatalogRow, KpiId, Channel } from '@prism/contract';
import type { InsightResult, KpiResult, RecommendationResult } from './types';
import { enabledKpis, weightOf } from './config';
import { round1 } from './normalize';

const OWNER: Record<Channel, string> = {
  fix: 'Prism (data)', nudge: 'You', rec: 'You', team: 'Team lead', org: 'Platform admin',
};

interface Candidate {
  ref: string;
  title: string;
  rationale: string;
  channel: Channel;
  targets: KpiId[];
}

export function deriveRecommendations(
  kpis: KpiResult[], insights: InsightResult[], catalog: KpiCatalogRow[], config: IndexConfig,
): RecommendationResult[] {
  const byId = new Map(kpis.map((k) => [k.kpi_id, k]));
  const has = (kpiId: string, hypothesis: string) =>
    insights.some((i) => i.kpi_id === kpiId && i.hypothesis === hypothesis);

  // Dimension weight share on the main index (per-KPI weights summed per dim).
  const dimWeight = (dim: 'usage' | 'efficiency' | 'outcomes'): number =>
    enabledKpis(catalog, config, 'main').filter((k) => k.dimension === dim)
      .reduce((a, k) => a + weightOf(config, k.kpi_id), 0) / 100;

  const impactFor = (targets: KpiId[]): number => {
    let best = 0;
    for (const t of targets) {
      const row = catalog.find((k) => k.kpi_id === t);
      const r = byId.get(t);
      if (!row || !r || r.score === null) continue;
      const weightShare = row.index_kind === 'main'
        ? dimWeight(row.dimension as 'usage' | 'efficiency' | 'outcomes')
        : weightOf(config, t) / 100;   // harness lift share
      best = Math.max(best, (100 - r.score) * weightShare);
    }
    return round1(best);
  };

  const candidates: Candidate[] = [];
  const push = (c: Candidate) => candidates.push(c);

  if (has('revert', 'H1')) {
    push({
      ref: 'review-gate', channel: 'team', targets: ['revert'],
      title: 'Review gate for AI-majority PRs',
      rationale: 'Reverts were caught by others — require ≥1 substantive comment or a checklist pass before merging AI-majority PRs.',
    });
  }
  if (has('revert', 'H2') || has('verification', 'H2') || has('linkage', 'LINK')) {
    push({
      ref: 'verify-before-pr', channel: 'rec', targets: ['verification', 'revert'],
      title: 'Add the verify-before-PR rule to CLAUDE.md',
      rationale: 'Unverified AI PRs are the ones that revert. Encode "run the harness before opening a PR" where the agent reads it — the habit follows the instruction.',
    });
  }
  if (has('iterations', 'H2') || has('continuity', 'H1')) {
    push({
      ref: 'claude-md', channel: 'rec', targets: ['iterations', 'continuity'],
      title: 'Author CLAUDE.md for your home repo',
      rationale: 'Sessions start cold and re-derive everything. Build/run/test + conventions in CLAUDE.md gives the repo a memory; capture the two most-repeated instructions as skills.',
    });
  }
  if (has('continuity', 'H0') || has('tokens', 'H2')) {
    push({
      ref: 'enable-nudges', channel: 'nudge', targets: ['tokens', 'iterations', 'continuity'],
      title: 'Enable the C1 + C2 in-flow nudges',
      rationale: 'Context front-load and cache discipline are moment-of-work habits — private, need-gated, rate-capped ≤3/day, dismissible anytime.',
    });
  }
  if (has('tokens', 'H4')) {
    push({
      ref: 'handoff-file', channel: 'rec', targets: ['tokens', 'continuity'],
      title: 'Adopt the handoff-file pattern',
      rationale: 'Dead-end marathon sessions burn tokens and ship nothing. Checkpoint state to handoff.md and resume instead of restarting.',
    });
  }
  if (has('review_loop', 'H1')) {
    push({
      ref: 'review-skill', channel: 'org', targets: ['review_loop', 'revert'],
      title: 'Ship /review and default it in the PR flow',
      rationale: 'No pre-PR critique pass exists. An org /review skill seeded with the team checklist gives the practice a handle; looped PRs cut human review burden ~4×.',
    });
  }
  if (has('ai_share', 'H2')) {
    push({
      ref: 'legacy-pilot', channel: 'rec', targets: ['ai_share'],
      title: 'Pilot AI on the next ticket outside your AI comfort zone',
      rationale: 'AI never touches part of the codebase. One end-to-end ticket there — with a CLAUDE.md added first — is the cheapest test of whether the gap is habit or fit.',
    });
  }
  if (has('ai_share', 'H1')) {
    push({
      ref: 'first-ticket', channel: 'rec', targets: ['ai_share', 'cadence'],
      title: 'Run one real ticket end-to-end with Claude Code this week',
      rationale: 'Below the L0 gate the index stays Dormant. Pick a well-scoped ticket, work it in-repo on a feature branch, and open the PR from the session.',
    });
  }
  if (has('cadence', 'H3')) {
    push({
      ref: 'seat-upgrade', channel: 'org', targets: ['cadence'],
      title: 'Raise the seat tier (usage stops at the cap)',
      rationale: 'Appetite exceeds quota — sessions stop mid-week when the cap hits. Administrative fix, then re-check cadence in 14 days.',
    });
  }
  if (has('cadence', 'H1')) {
    push({
      ref: 'ai-habit', channel: 'nudge', targets: ['cadence'],
      title: 'Use AI on the next 3 maintenance tickets',
      rationale: 'The habit exists for feature work only. Investigation + fix-draft on maintenance tickets closes the gap weeks.',
    });
  }
  if (has('skills_authored', 'H1')) {
    push({
      ref: 'save-skill', channel: 'nudge', targets: ['skills_authored', 'iterations'],
      title: 'Capture your repeated pattern as a first skill',
      rationale: 'The same problem class recurs across sessions with no reusable asset. One-click save-as-skill collapses repeats into single turns.',
    });
  }
  if (has('rework', 'H0')) {
    push({
      ref: 'pre-pr-review', channel: 'rec', targets: ['rework', 'review_loop'],
      title: 'Move review earlier — run the pre-PR loop',
      rationale: 'Fix follow-ups land within days of merging. Findings that land before merge are edits; after merge they are defect-rework.',
    });
  }

  // Dedupe by ref, score by impact, rank.
  const seen = new Set<string>();
  const ranked = candidates
    .filter((c) => (seen.has(c.ref) ? false : (seen.add(c.ref), true)))
    .map((c) => ({ ...c, owner: OWNER[c.channel], impact: impactFor(c.targets) }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6)
    .map((c, i) => ({ ...c, rank: i + 1 }));
  return ranked;
}
