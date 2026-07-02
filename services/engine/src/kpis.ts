// The KPI calculators — Core-6 (main), Harness-4, and tier-badged KPI 9
// (diagnostic until promoted). All pure; all read the same DevContext.
// Preview decisions (logged):
//   · KPI 1 counts links of ANY method after hardening (exact-first trust
//     mitigation surfaces via meta.link_methods for the drill-down).
//   · KPI 4 scores on EXACT pr_link matches only (spec §4).
//   · KPI 6 scored tokens = in-scope (tokens_in + tokens_out); cache reads are
//     a diagnostic share, exploration is meta, never scored.
//   · KPI 13 scores the RATE; BREADTH is reported alongside (blend is an open
//     decision, spec §12.7).
//   · Revert PRs are excluded from all "shipped work" denominators.

import type {
  CommitRow, DeployEventRow, DeveloperRow, KpiCatalogRow, PrRow, RepoRow,
  SessionRow, SkillRow,
} from '@prism/contract';
import type { ComputedLink, KpiResult } from './types';
import { normalize, pct, round1, mean } from './normalize';
import { prKey } from './link';
import { activityDays, bucketOf, sizeCutoffs, utcDay, type SizeBucket } from './window';

const DAY_MS = 86400_000;

export interface DevContext {
  dev: DeveloperRow;
  repos: Map<string, RepoRow>;
  connected: Set<string>;
  mergedPrs: PrRow[];              // dev's merged, non-revert PRs in window
  revertPrs: PrRow[];              // ALL revert PRs in window (any author — who-caught routing)
  sessions: SessionRow[];          // dev's sessions in window
  commits: CommitRow[];            // dev's commits in window
  skills: SkillRow[];
  allSessions: SessionRow[];       // everyone's (multiplier signal)
  allMergedPrs: PrRow[];           // everyone's merged non-revert PRs (size tertiles)
  deploys: DeployEventRow[];
  linkByPr: Map<string, ComputedLink[]>;
  sessionById: Map<string, SessionRow>;
}

export function buildContext(
  dev: DeveloperRow,
  raw: { repos: RepoRow[]; prs: PrRow[]; commits: CommitRow[]; sessions: SessionRow[]; skills: SkillRow[]; deployEvents: DeployEventRow[] },
  linkByPr: Map<string, ComputedLink[]>,
  window: { startIso: string; endIso: string },
  allSessions: SessionRow[],
): DevContext {
  const inWin = (iso: string | null) => iso !== null && iso >= window.startIso && iso <= window.endIso;
  const allMergedPrs = raw.prs.filter((p) => inWin(p.merged_at) && !p.is_revert);
  return {
    dev,
    repos: new Map(raw.repos.map((r) => [r.repo, r])),
    connected: new Set(raw.repos.filter((r) => r.connected).map((r) => r.repo)),
    mergedPrs: allMergedPrs.filter((p) => p.developer_id === dev.id),
    revertPrs: raw.prs.filter((p) => p.is_revert && inWin(p.merged_at)),
    sessions: raw.sessions.filter((s) => s.developer_id === dev.id && inWin(s.started_at)),
    commits: raw.commits.filter((c) => c.developer_id === dev.id && inWin(c.authored_at)),
    skills: raw.skills.filter((s) => s.developer_id === dev.id),
    allSessions,
    allMergedPrs,
    deploys: raw.deployEvents.filter((d) => inWin(d.deployed_at)),
    linkByPr,
    sessionById: new Map(allSessions.map((s) => [s.id, s])),
  };
}

/** Dev's AI-linked merged PRs (any unsuppressed method). */
export const aiPrs = (ctx: DevContext): PrRow[] =>
  ctx.mergedPrs.filter((p) => (ctx.linkByPr.get(prKey(p.repo, p.number)) ?? []).length > 0);

/** Dev's AI PRs with an EXACT (pr_link) match — the KPI 4 denominator. */
export const exactAiPrs = (ctx: DevContext): PrRow[] =>
  ctx.mergedPrs.filter((p) =>
    (ctx.linkByPr.get(prKey(p.repo, p.number)) ?? []).some((l) => l.method === 'pr_link'));

export const sessionsForPr = (ctx: DevContext, pr: PrRow, exactOnly = false): SessionRow[] =>
  (ctx.linkByPr.get(prKey(pr.repo, pr.number)) ?? [])
    .filter((l) => !exactOnly || l.method === 'pr_link')
    .map((l) => ctx.sessionById.get(l.session_id))
    .filter((s): s is SessionRow => !!s);

const catalogRow = (catalog: KpiCatalogRow[], id: string): KpiCatalogRow => {
  const row = catalog.find((k) => k.kpi_id === id);
  if (!row) throw new Error(`kpi_catalog missing ${id}`);
  return row;
};

// ── KPI 1 · AI-assisted PR share ─────────────────────────────────────────────
export function kpiAiShare(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const merged = ctx.mergedPrs;
  const ai = aiPrs(ctx);
  const raw = pct(ai.length, merged.length);
  const methods: Record<string, number> = {};
  for (const p of ai) {
    const best = (ctx.linkByPr.get(prKey(p.repo, p.number)) ?? []).sort((a, b) => b.confidence - a.confidence)[0];
    if (best) methods[best.method] = (methods[best.method] ?? 0) + 1;
  }
  return {
    kpi_id: 'ai_share', index_kind: 'main', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'ai_share')),
    signal_count: merged.length, tier: null,
    meta: { ai_prs: ai.length, merged_prs: merged.length, link_methods: methods },
  };
}

// ── KPI 3 · Session cadence ──────────────────────────────────────────────────
export function kpiCadence(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const { workingDays, sessionDays } = activityDays(ctx.sessions, ctx.mergedPrs, ctx.commits);
  const raw = pct(sessionDays.size, workingDays.size);
  // Burst detection (3-H1): longest gap between consecutive session days.
  const days = [...sessionDays].sort();
  let maxGap = 0;
  for (let i = 1; i < days.length; i++) {
    maxGap = Math.max(maxGap, Math.round((Date.parse(days[i]!) - Date.parse(days[i - 1]!)) / DAY_MS));
  }
  return {
    kpi_id: 'cadence', index_kind: 'main', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'cadence')),
    signal_count: workingDays.size, tier: null,
    meta: { session_days: sessionDays.size, working_days: workingDays.size, max_gap_days: maxGap, day_list: [...workingDays].sort() },
  };
}

// ── KPI 4 · AI iterations to merge (exact links only) ───────────────────────
export function kpiIterations(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const cutoffs = sizeCutoffs(ctx.allMergedPrs);
  const prs = exactAiPrs(ctx);
  const perBucket: Record<SizeBucket, number[]> = { S: [], M: [], L: [] };
  const perPr: Array<{ number: number; turns: number; bucket: SizeBucket }> = [];
  for (const pr of prs) {
    const turns = sessionsForPr(ctx, pr, true).reduce((a, s) => a + s.turns, 0);
    const bucket = bucketOf(pr, cutoffs);
    perBucket[bucket].push(turns);
    perPr.push({ number: pr.number, turns, bucket });
  }
  const bucketMeans = (['S', 'M', 'L'] as const).map((b) => mean(perBucket[b])).filter((m): m is number => m !== null);
  const raw = mean(bucketMeans);
  return {
    kpi_id: 'iterations', index_kind: 'main', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'iterations')),
    signal_count: prs.length, tier: null,
    meta: { per_pr: perPr, cutoffs, exact_links_only: true },
  };
}

// ── KPI 6 · Tokens to shipped (tokens only, in-scope only) ───────────────────
export function kpiTokens(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const inScope = ctx.sessions.filter((s) => s.repo !== null && ctx.connected.has(s.repo));
  const outScope = ctx.sessions.filter((s) => s.repo === null || !ctx.connected.has(s.repo));
  const sumK = (xs: SessionRow[]) => Math.round(xs.reduce((a, s) => a + s.tokens_in + s.tokens_out, 0) / 1000);
  const inScopeK = sumK(inScope);
  const merged = ctx.mergedPrs.length;
  const raw = merged > 0 ? round1(inScopeK / merged) : null;
  const cacheIn = inScope.reduce((a, s) => a + s.cache_read_tokens, 0);
  const totalIn = inScope.reduce((a, s) => a + s.tokens_in, 0);
  const linkedSessionIds = new Set(
    [...ctx.linkByPr.values()].flat().filter((l) => l.developer_id === ctx.dev.id).map((l) => l.session_id));
  const deadEnds = inScope
    .filter((s) => !linkedSessionIds.has(s.id) && s.tokens_in + s.tokens_out > 50_000)
    .map((s) => ({ session_key: s.session_key, tokens_k: Math.round((s.tokens_in + s.tokens_out) / 1000) }));
  return {
    kpi_id: 'tokens', index_kind: 'main', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'tokens')),
    signal_count: merged, tier: null,
    meta: {
      in_scope_k: inScopeK, exploration_k: sumK(outScope),
      cache_read_share: totalIn + cacheIn > 0 ? round1((cacheIn / (totalIn + cacheIn)) * 100) : null,
      dead_end_sessions: deadEnds,
    },
  };
}

// ── KPI 7 · Merged without revert (all post-merge reverts count) ─────────────
export function kpiRevert(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const ai = aiPrs(ctx);
  const reverted: Array<{ number: number; caught_by: 'self' | 'other'; revert_pr: number }> = [];
  for (const pr of ai) {
    const revert = ctx.revertPrs.find(
      (r) => r.repo === pr.repo && r.revert_of === pr.number && r.merged_at && pr.merged_at &&
        Date.parse(r.merged_at) - Date.parse(pr.merged_at) <= 14 * DAY_MS,
    );
    if (revert) {
      reverted.push({
        number: pr.number,
        caught_by: revert.developer_id === ctx.dev.id ? 'self' : 'other',
        revert_pr: revert.number,
      });
    }
  }
  const raw = ai.length > 0 ? round1(((ai.length - reverted.length) / ai.length) * 100) : null;
  return {
    kpi_id: 'revert', index_kind: 'main', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'revert')),
    signal_count: ai.length, tier: null,
    // who-caught routes the ACTION, never the score (v2.2 decision)
    meta: { reverted, small_sample: ai.length > 0 && ai.length < 5 },
  };
}

// ── KPI 9 · Change reliability (Tier-1, diagnostic until promoted) ───────────
export function kpiReliability(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const aiShas = new Set(aiPrs(ctx).map((p) => p.merge_sha).filter((s): s is string => !!s));
  const myDeploys = ctx.deploys.filter((d) => d.kind === 'deploy' && d.merge_shas.some((s) => aiShas.has(s)));
  const failures: Array<{ deploy_key: string; via: string; batch_size: number }> = [];
  for (const d of myDeploys) {
    const rolledBack = ctx.deploys.find((r) => r.kind === 'rollback' && r.rollback_of === d.deploy_key);
    const hotfixed = ctx.deploys.find(
      (h) => h.fix_tagged && h.service === d.service && h.deploy_key !== d.deploy_key &&
        Date.parse(h.deployed_at) > Date.parse(d.deployed_at) &&
        Date.parse(h.deployed_at) - Date.parse(d.deployed_at) <= 48 * 3600_000,
    );
    if (rolledBack || hotfixed) {
      failures.push({
        deploy_key: d.deploy_key,
        via: rolledBack ? 'rollback' : 'hotfix ≤48h',
        batch_size: d.merge_shas.length,   // >1 → batch blur, low-confidence attribution (9-H3)
      });
    }
  }
  const raw = myDeploys.length > 0 ? round1((failures.length / myDeploys.length) * 100) : null;
  return {
    kpi_id: 'reliability', index_kind: 'diagnostic', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'reliability')),
    signal_count: myDeploys.length, tier: raw === null ? null : 'T1',
    meta: { ai_deploys: myDeploys.length, failures, batch_blur: failures.some((f) => f.batch_size > 1) },
  };
}

// ── KPI 10 · Defect-rework rate (evidence ladder + wip exclusion) ────────────
const FIX_TYPE_RE = /^fix[:(]/i;
const FIX_PATTERN_RE = /\b(fix|patch|correct|resolve|hotfix)\b/i;

export function reworkTier(c: CommitRow): 'issue_link' | 'fix_type' | 'pattern' | null {
  if (c.linked_issue_kind === 'bug') return 'issue_link';
  if (FIX_TYPE_RE.test(c.message)) return 'fix_type';
  if (FIX_PATTERN_RE.test(c.message)) return 'pattern';
  return null;
}

export function kpiRework(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const eligible = ctx.mergedPrs.filter((p) => !p.labels.includes('wip-increment'));
  const excludedWip = ctx.mergedPrs.length - eligible.length;
  const pairs: Array<{ pr: number; fix_sha: string; tier: string }> = [];
  for (const pr of eligible) {
    const fix = ctx.commits.find(
      (c) => c.hunk_overlap_pr === pr.number && pr.merged_at &&
        Date.parse(c.authored_at) - Date.parse(pr.merged_at) <= 14 * DAY_MS &&
        Date.parse(c.authored_at) >= Date.parse(pr.merged_at) && reworkTier(c) !== null,
    );
    if (fix) pairs.push({ pr: pr.number, fix_sha: fix.sha.slice(0, 8), tier: reworkTier(fix)! });
  }
  const raw = pct(pairs.length, eligible.length);
  return {
    kpi_id: 'rework', index_kind: 'main', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'rework')),
    signal_count: eligible.length, tier: null,
    meta: { pairs, excluded_wip: excludedWip },
  };
}

// ── KPI 12 · Distinct skills authored (execution evidence required) ──────────
export function kpiSkillsAuthored(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const invokedWithOutput = new Set(
    ctx.allSessions.flatMap((s) => s.skill_invocations.filter((i) => i.had_output).map((i) => i.name)));
  const real = ctx.skills.filter((sk) => invokedWithOutput.has(sk.name));
  const raw = real.length;
  return {
    kpi_id: 'skills_authored', index_kind: 'harness', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'skills_authored')),
    signal_count: ctx.skills.length, tier: null,
    meta: { authored: ctx.skills.map((s) => s.name), real: real.map((s) => s.name) },
  };
}

/** Multiplier signal — dev's skills invoked (with output) in OTHER devs' sessions. */
export function multiplierSignal(ctx: DevContext): number {
  const mine = new Set(ctx.skills.map((s) => s.name));
  const users = new Set<string>();
  for (const s of ctx.allSessions) {
    if (s.developer_id === ctx.dev.id) continue;
    for (const inv of s.skill_invocations) {
      if (inv.had_output && mine.has(inv.name)) users.add(`${s.developer_id}:${inv.name}`);
    }
  }
  return users.size;
}

// ── KPI 13 · Verification harness rate (+ breadth, reported alongside) ───────
export function kpiVerification(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const ai = aiPrs(ctx);
  let verified = 0;
  const breadths: number[] = [];
  for (const pr of ai) {
    const events = sessionsForPr(ctx, pr).flatMap((s) => s.verification_events);
    const repo = ctx.repos.get(pr.repo);
    const applicable = ['V1', 'V2', 'V3', 'V4'].filter((c) =>
      c === 'V4' || (c === 'V1' && repo?.has_build) || (c === 'V2' && repo?.has_tests) || (c === 'V3' && repo?.has_lint));
    if (events.length > 0) {
      verified++;
      const used = new Set(events.map((e) => e.category));
      breadths.push(applicable.length ? used.size / applicable.length : 0);
    }
  }
  const raw = pct(verified, ai.length);
  const breadth = breadths.length ? round1((breadths.reduce((a, b) => a + b, 0) / breadths.length) * 100) : null;
  return {
    kpi_id: 'verification', index_kind: 'harness', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'verification')),
    signal_count: ai.length, tier: null,
    meta: { verified, ai_prs: ai.length, breadth_pct: breadth },
  };
}

// ── KPI 14 · Review-loop rate (theater guard) ────────────────────────────────
export function kpiReviewLoop(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const ai = aiPrs(ctx);
  let looped = 0;
  let theater = 0;
  for (const pr of ai) {
    const passes = sessionsForPr(ctx, pr).map((s) => s.review_pass).filter((r) => r?.ran);
    const real = passes.some((r) => r && (r.diff_changed || r.findings === 0));
    if (real) looped++;
    else if (passes.length) theater++;   // ran, but no diff change AND no findings record
  }
  const raw = pct(looped, ai.length);
  return {
    kpi_id: 'review_loop', index_kind: 'harness', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'review_loop')),
    signal_count: ai.length, tier: null,
    meta: { looped, theater_passes: theater },
  };
}

// ── KPI 15 · Context continuity rate ─────────────────────────────────────────
export function kpiContinuity(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult {
  const connected = ctx.sessions.filter((s) => s.repo !== null && ctx.connected.has(s.repo));
  const warm = connected.filter((s) => s.context_read_at_start);
  const raw = pct(warm.length, connected.length);
  const coldChars = connected.filter((s) => !s.context_read_at_start).map((s) => s.first_prompt_chars);
  return {
    kpi_id: 'continuity', index_kind: 'harness', raw_value: raw,
    score: normalize(raw, catalogRow(catalog, 'continuity')),
    signal_count: connected.length, tier: null,
    meta: { warm: warm.length, sessions: connected.length, avg_cold_first_prompt_chars: mean(coldChars) },
  };
}

export function computeKpis(ctx: DevContext, catalog: KpiCatalogRow[]): KpiResult[] {
  return [
    kpiAiShare(ctx, catalog), kpiCadence(ctx, catalog), kpiIterations(ctx, catalog),
    kpiTokens(ctx, catalog), kpiRevert(ctx, catalog), kpiReliability(ctx, catalog),
    kpiRework(ctx, catalog), kpiSkillsAuthored(ctx, catalog), kpiVerification(ctx, catalog),
    kpiReviewLoop(ctx, catalog), kpiContinuity(ctx, catalog),
  ];
}
