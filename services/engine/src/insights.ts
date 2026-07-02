// Deterministic insight derivation — the lab's hypothesis→insight→action rows
// as executable tests. Only CONFIRMED hypotheses become insights; every body is
// a template filled with engine-computed numbers (keyless — no LLM anywhere,
// mirroring lib/agents/mock-model.ts's determinism boundary).
//
// H0 ("is the number even real?") runs first where the dummy data can exhibit
// a measurement artifact (weak link methods); behavior hypotheses follow.

import type { KpiCatalogRow } from '@prism/contract';
import type { InsightResult, KpiResult } from './types';
import { aiPrs, sessionsForPr, type DevContext } from './kpis';
import type { LinkageFinding } from './linkage';
import { prKey } from './link';

export interface TeamStats {
  /** mean KPI-4 raw (turns) for devs whose home repo has a CLAUDE.md, and not. */
  iterationsWithContext: number | null;
  iterationsWithoutContext: number | null;
  /** mean KPI-13 raw (verification rate %) by repo verify-rule presence. */
  verificationWithRule: number | null;
  verificationWithoutRule: number | null;
}

const kpi = (kpis: KpiResult[], id: string): KpiResult | undefined => kpis.find((k) => k.kpi_id === id);
const below = (k: KpiResult | undefined, threshold = 70): boolean =>
  !!k && k.score !== null && k.score < threshold;

export function deriveInsights(
  ctx: DevContext, kpis: KpiResult[], linkage: LinkageFinding[], team: TeamStats,
): InsightResult[] {
  const out: InsightResult[] = [];
  const ai = aiPrs(ctx);

  // ── KPI 1 · AI-assisted PR share ───────────────────────────────────────────
  const share = kpi(kpis, 'ai_share');
  if (share) {
    const methods = (share.meta.link_methods ?? {}) as Record<string, number>;
    const weak = (methods.branch ?? 0) + (methods.coauthor ?? 0) + (methods.sha ?? 0);
    if (weak > 0) {
      out.push({
        kpi_id: 'ai_share', hypothesis: 'H0', channel: 'fix',
        title: `${weak} AI PR${weak > 1 ? 's' : ''} linked only by a weak method`,
        body: `${weak} of your ${ai.length} AI-linked PRs matched via fallback methods (${Object.entries(methods).filter(([m]) => m !== 'pr_link').map(([m, n]) => `${m}: ${n}`).join(', ')}) — browser-opened PRs lack the first-party pr-link marker. Verify the link audit before coaching; exact links keep this number beyond dispute.`,
        magnitude: { weak_links: weak, exact_links: methods.pr_link ?? 0 },
        evidence: { link_methods: methods },
      });
    }
    if (below(share, 60) && ai.length >= 2) {
      const aiModules = new Set(ai.map((p) => p.module_path));
      const nonAiModules = new Set(ctx.mergedPrs.filter((p) => !ai.includes(p)).map((p) => p.module_path));
      const overlap = [...aiModules].some((m) => nonAiModules.has(m));
      if (!overlap && nonAiModules.size > 0) {
        out.push({
          kpi_id: 'ai_share', hypothesis: 'H2', channel: 'rec',
          title: 'AI is selective — it never touches your other modules',
          body: `All ${ai.length} AI PRs sit in ${[...aiModules].join(', ')}; the ${ctx.mergedPrs.length - ai.length} non-AI PRs live in ${[...nonAiModules].join(', ')}. Pilot AI on the next ticket there — and add a CLAUDE.md to that area first so it has context.`,
          magnitude: { ai_share_pct: share.raw_value, ai_modules: [...aiModules], non_ai_modules: [...nonAiModules] },
          evidence: { ai_prs: ai.map((p) => p.number) },
        });
      }
    }
    if (share.raw_value !== null && share.raw_value < 15) {
      out.push({
        kpi_id: 'ai_share', hypothesis: 'H1', channel: 'rec',
        title: 'AI touches almost none of what ships (L0 gate)',
        body: `Only ${(share.meta.ai_prs as number)} of ${(share.meta.merged_prs as number)} merged PRs had an AI session behind them (${share.raw_value}% — below the 15% L0 gate). Start with one real ticket end-to-end this week; the index stays Dormant until AI touches ≥15% of shipped work.`,
        magnitude: { ai_share_pct: share.raw_value, l0_gate: 15 },
        evidence: { merged_prs: share.meta.merged_prs },
      });
    }
  }

  // ── KPI 3 · Session cadence ────────────────────────────────────────────────
  const cadence = kpi(kpis, 'cadence');
  // H3 fires on the PATTERN (capped seat + all sessions clustered Mon–Wed),
  // not on the score — appetite exceeding quota is administrative either way.
  const sessionWeekdays = new Set(ctx.sessions.map((s) => new Date(s.started_at).getUTCDay()));
  const earlyWeekOnly = sessionWeekdays.size > 0 && [...sessionWeekdays].every((d) => d >= 1 && d <= 3);
  if (ctx.dev.seat_tier === 'capped' && ctx.sessions.length >= 5 && earlyWeekOnly) {
    out.push({
      kpi_id: 'cadence', hypothesis: 'H3', channel: 'org',
      title: 'Usage stops mid-week when the seat cap hits — appetite exceeds quota',
      body: `Every session this window ran Mon–Wed and stopped — this seat is on the capped tier, so Thursday/Friday appetite has nowhere to go. The gap is administrative, not behavioral: raise the seat tier or set cap alerts, then re-check cadence in 14 days.`,
      magnitude: { cadence_pct: cadence?.raw_value ?? null, seat_tier: 'capped' },
      evidence: { session_days: cadence?.meta.session_days },
    });
  }
  if (cadence && below(cadence)) {
    const gap = (cadence.meta.max_gap_days as number) ?? 0;
    if (gap >= 7 && ctx.dev.seat_tier !== 'capped') {
      out.push({
        kpi_id: 'cadence', hypothesis: 'H1', channel: 'nudge',
        title: 'Bursts, then silence — the habit exists for feature work only',
        body: `AI use runs in bursts with a ${gap}-day gap in between: it spikes in feature weeks and disappears in maintenance weeks. Need-gated nudge queued: try AI on the next maintenance/investigation ticket (rate-capped, dismissible).`,
        magnitude: { cadence_pct: cadence.raw_value, max_gap_days: gap },
        evidence: { day_list: cadence.meta.day_list },
      });
    }
  }

  // ── KPI 4 · Iterations (missing context) ──────────────────────────────────
  const iterations = kpi(kpis, 'iterations');
  const homeRepo = ctx.repos.get(mostCommonRepo(ctx) ?? '');
  if (iterations && below(iterations, 60) && homeRepo && !homeRepo.has_claude_md) {
    const norm = team.iterationsWithContext;
    out.push({
      kpi_id: 'iterations', hypothesis: 'H2', channel: 'rec',
      title: 'The repo has no memory — every session re-derives context',
      body: `${iterations.raw_value} turns per merged PR${norm !== null ? ` vs ~${norm} in repos that carry a CLAUDE.md` : ''} — ${homeRepo.repo} has no CLAUDE.md, so sessions start from zero. Author one (build/run/test + conventions) and capture the two most-repeated instructions as skills.`,
      magnitude: { turns: iterations.raw_value, context_rich_norm: norm },
      evidence: { per_pr: iterations.meta.per_pr, repo: homeRepo.repo },
    });
  }

  // ── KPI 6 · Tokens (scope, cache, dead ends) ──────────────────────────────
  const tokens = kpi(kpis, 'tokens');
  if (tokens) {
    const explorationK = (tokens.meta.exploration_k as number) ?? 0;
    const inScopeK = (tokens.meta.in_scope_k as number) ?? 0;
    const cacheShare = tokens.meta.cache_read_share as number | null;
    const deadEnds = (tokens.meta.dead_end_sessions as Array<{ session_key: string; tokens_k: number }>) ?? [];
    if (explorationK > 0 && explorationK >= 0.4 * (explorationK + inScopeK)) {
      out.push({
        kpi_id: 'tokens', hypothesis: 'H1', channel: 'rec',
        title: 'A large share of tokens is exploration — visible, not punished',
        body: `${Math.round((explorationK / (explorationK + inScopeK)) * 100)}% of your tokens (${explorationK}k) sit in sessions outside connected repos. That is R&D spend — excluded from tokens-per-PR by the scope rule, shown so it never silently inflates the number.`,
        magnitude: { exploration_k: explorationK, in_scope_k: inScopeK },
        evidence: {},
      });
    }
    if (below(tokens, 80) && cacheShare !== null && cacheShare < 15) {
      out.push({
        kpi_id: 'tokens', hypothesis: 'H2', channel: 'nudge',
        title: 'Context is re-sent from scratch — a habit problem, not a model problem',
        body: `Cache-read share is ${cacheShare}% vs the ~34% norm: context gets re-fed every session instead of cached. C2 fires in-flow — compact/pin the context block and prefer continuation sessions (also lifts KPI 15).`,
        magnitude: { cache_read_share: cacheShare, norm: 34 },
        evidence: { in_scope_k: inScopeK },
      });
    }
    if (deadEnds.length >= 2) {
      out.push({
        kpi_id: 'tokens', hypothesis: 'H4', channel: 'rec',
        title: `${deadEnds.length} dead-end sessions burned tokens and shipped nothing`,
        body: `${deadEnds.length} high-token sessions (${deadEnds.map((d) => `${d.tokens_k}k`).join(', ')}) never linked to any PR. Adopt the handoff-file pattern: checkpoint state to a file and resume, instead of restarting from zero.`,
        magnitude: { dead_end_count: deadEnds.length, dead_end_k: deadEnds.reduce((a, d) => a + d.tokens_k, 0) },
        evidence: { sessions: deadEnds.map((d) => d.session_key) },
      });
    }
  }

  // ── KPI 7 · Reverts (who-caught routes the action) ────────────────────────
  const revert = kpi(kpis, 'revert');
  if (revert) {
    const reverted = (revert.meta.reverted as Array<{ number: number; caught_by: 'self' | 'other'; revert_pr: number }>) ?? [];
    const unverifiedReverts = reverted.filter(({ number }) => {
      const pr = ai.find((p) => p.number === number);
      return pr && !sessionsForPr(ctx, pr).some((s) => s.verification_events.length > 0);
    });
    if (unverifiedReverts.length > 0) {
      out.push({
        kpi_id: 'revert', hypothesis: 'H2', channel: 'nudge',
        title: 'Every reverted PR shipped without in-session verification',
        body: `${unverifiedReverts.length} of ${reverted.length} reverted AI PRs (#${unverifiedReverts.map((r) => r.number).join(', #')}) had zero verification events in their sessions. C4 fires at diff-time: "src changed, no tests in session" → tests-skill reminder before the PR opens.`,
        magnitude: { unverified_reverts: unverifiedReverts.length, reverted: reverted.length },
        evidence: { prs: unverifiedReverts.map((r) => r.number) },
      });
    }
    const otherCaught = reverted.filter((r) => r.caught_by === 'other');
    const selfCaught = reverted.filter((r) => r.caught_by === 'self');
    if (otherCaught.length > 0) {
      out.push({
        kpi_id: 'revert', hypothesis: 'H1', channel: 'team',
        title: `${otherCaught.length} revert${otherCaught.length > 1 ? 's were' : ' was'} caught by someone else — the review gate failed`,
        body: `PR${otherCaught.length > 1 ? 's' : ''} #${otherCaught.map((r) => r.number).join(', #')} merged and had to be reverted by a teammate. All reverts count in the score; who caught it routes the fix — this one is a process gap: require ≥1 substantive comment or checklist pass on AI-majority PRs before merge.`,
        magnitude: { other_caught: otherCaught.length },
        evidence: { reverts: otherCaught },
      });
    }
    if (selfCaught.length > 0) {
      out.push({
        // 'ROUTE' not 'H2': who-caught routing is the v2.2 DECISION, not a lab
        // hypothesis row — and it must not collide with the H2 missing-tests key.
        kpi_id: 'revert', hypothesis: 'ROUTE', channel: 'rec',
        title: `${selfCaught.length} self-caught revert${selfCaught.length > 1 ? 's' : ''} — catchable before the PR`,
        body: `You caught and reverted PR #${selfCaught.map((r) => r.number).join(', #')} yourself — it still counts (merged is merged), but the route is verification coaching: a pre-PR harness run (KPI 13) would have caught it in-session, before review ever saw it.`,
        magnitude: { self_caught: selfCaught.length },
        evidence: { reverts: selfCaught },
      });
    }
  }

  // ── KPI 9 · Change reliability (tier-badged, diagnostic) ──────────────────
  const reliability = kpi(kpis, 'reliability');
  if (reliability && ((reliability.meta.failures as unknown[]) ?? []).length > 0) {
    const failures = reliability.meta.failures as Array<{ deploy_key: string; via: string; batch_size: number }>;
    const blurred = failures.filter((f) => f.batch_size > 1);
    out.push({
      kpi_id: 'reliability', hypothesis: blurred.length ? 'H3' : 'H0', channel: blurred.length ? 'org' : 'team',
      title: blurred.length
        ? 'A failed deploy carried multiple PRs — attribution is blurred'
        : `A deploy carrying your AI change failed in production (T1)`,
      body: blurred.length
        ? `${blurred.length} of ${failures.length} failed deploys carried >1 PR (batch of ${blurred[0]!.batch_size}) — collective blame is not attribution, so these are flagged low-confidence. Smaller release batches or per-PR deploy tagging sharpens this number. [Tier badge: T1 — deploy-system native events, zero estimation.]`
        : `Deploy ${failures[0]!.deploy_key} was undone via ${failures[0]!.via} — the DORA change-failure definition, straight from deploy events (no Sentry involved). [Tier badge: T1.] The AI-vs-human failure-rate control ships alongside before this number is socialized.`,
      magnitude: { failure_rate_pct: reliability.raw_value, tier: 'T1' },
      evidence: { failures },
    });
  }

  // ── KPI 10 · Rework ────────────────────────────────────────────────────────
  const rework = kpi(kpis, 'rework');
  if (rework) {
    const excluded = (rework.meta.excluded_wip as number) ?? 0;
    const pairs = (rework.meta.pairs as Array<{ pr: number; tier: string }>) ?? [];
    if (excluded > 0) {
      out.push({
        kpi_id: 'rework', hypothesis: 'H1', channel: 'team',
        title: `${excluded} staged increment${excluded > 1 ? 's' : ''} excluded from the rework rate`,
        body: `${excluded} PR${excluded > 1 ? 's' : ''} carried the wip-increment tag — deliberate staged shipping, not a defect. The KPI excludes ${excluded > 1 ? 'them' : 'it'} cleanly; the remaining rate counts only fix-type follow-ups on the same hunks ≤14d.`,
        magnitude: { excluded_wip: excluded },
        evidence: {},
      });
    }
    if (below(rework, 50) && pairs.length >= 2) {
      out.push({
        kpi_id: 'rework', hypothesis: 'H0', channel: 'rec',
        title: `${pairs.length} PRs needed fix follow-ups on the same code within 14 days`,
        body: `PR${pairs.length > 1 ? 's' : ''} #${pairs.map((p) => p.pr).join(', #')} each got a fix-type follow-up on overlapping hunks (evidence: ${pairs.map((p) => p.tier).join(', ')}). Each pair is published with its evidence tier — audit them, then move review earlier (the pre-PR loop, KPI 14) so findings land before merge.`,
        magnitude: { rework_pct: rework.raw_value, pairs: pairs.length },
        evidence: { pairs },
      });
    }
  }

  // ── Harness KPIs ───────────────────────────────────────────────────────────
  const verification = kpi(kpis, 'verification');
  if (verification && below(verification, 60) && homeRepo) {
    const withRule = team.verificationWithRule;
    if (!homeRepo.verify_rule_in_claude_md) {
      out.push({
        kpi_id: 'verification', hypothesis: 'H2', channel: 'rec',
        title: 'The habit follows the instruction — and this repo has no verify rule',
        body: `Verification rate here is ${verification.raw_value}%${withRule !== null ? ` vs ${withRule}% for engineers in repos whose CLAUDE.md says "verify before PR"` : ''}. Add the verify-before-PR rule to ${homeRepo.repo}'s CLAUDE.md and re-measure in 14 days. (Breadth: ${verification.meta.breadth_pct ?? '—'}% of applicable categories when verification does run.)`,
        magnitude: { rate_pct: verification.raw_value, with_rule_norm: withRule },
        evidence: { repo: homeRepo.repo },
      });
    }
  }

  const skillsK = kpi(kpis, 'skills_authored');
  if (skillsK && skillsK.raw_value === 0 && ctx.sessions.length >= 10) {
    out.push({
      kpi_id: 'skills_authored', hypothesis: 'H1', channel: 'nudge',
      title: 'Repeat problems are being solved ad-hoc — zero skills authored',
      body: `${ctx.sessions.length} sessions this window and no reusable skill captured (metadata clustering only — prompt text never leaves the machine). After the next repeated pattern, the local nudge offers one-click "save this as a skill".`,
      magnitude: { sessions: ctx.sessions.length, skills: 0 },
      evidence: {},
    });
  }
  const reviewLoop = kpi(kpis, 'review_loop');
  if (reviewLoop && reviewLoop.raw_value === 0 && ai.length >= 3) {
    out.push({
      kpi_id: 'review_loop', hypothesis: 'H1', channel: 'org',
      title: 'No pre-PR critique pass, ever — the practice has no handle',
      body: `0 of ${ai.length} AI PRs ran a review loop before human review. Ship the org /review skill (seeded with the team checklist) and default it in the PR flow — looped PRs typically cut human review burden ~4×.`,
      magnitude: { looped: 0, ai_prs: ai.length },
      evidence: {},
    });
  }
  if (reviewLoop && ((reviewLoop.meta.theater_passes as number) ?? 0) > 0) {
    out.push({
      kpi_id: 'review_loop', hypothesis: 'H3', channel: 'team',
      title: 'A review pass ran but changed nothing and recorded nothing',
      body: `${reviewLoop.meta.theater_passes} review pass(es) produced no diff change and no findings record — review theater earns no credit (the guard requires a change or an explicit "no findings").`,
      magnitude: { theater_passes: reviewLoop.meta.theater_passes },
      evidence: {},
    });
  }

  const continuity = kpi(kpis, 'continuity');
  if (continuity && below(continuity, 40)) {
    const coldChars = continuity.meta.avg_cold_first_prompt_chars as number | null;
    if (coldChars !== null && coldChars >= 1200) {
      out.push({
        kpi_id: 'continuity', hypothesis: 'H0', channel: 'nudge',
        title: 'Context is hand-carried into every session',
        body: `Only ${continuity.raw_value}% of sessions start warm, and cold first prompts average ${Math.round(coldChars)} characters (length flag only — the text never leaves your machine): you are pasting the project context by hand. One-click nudge: "save this intro as CLAUDE.md".`,
        magnitude: { warm_pct: continuity.raw_value, avg_cold_chars: Math.round(coldChars) },
        evidence: { sessions: continuity.meta.sessions },
      });
    } else if (homeRepo && !homeRepo.has_claude_md) {
      out.push({
        kpi_id: 'continuity', hypothesis: 'H1', channel: 'rec',
        title: 'No durable context files exist in this repo',
        body: `${continuity.raw_value}% warm starts and ${homeRepo.repo} has no CLAUDE.md/handoff convention. Adopt handoff.md (status, decisions, next) — knowledge should live in files, not evaporate between sessions.`,
        magnitude: { warm_pct: continuity.raw_value },
        evidence: { repo: homeRepo.repo },
      });
    }
  }

  // ── 🔗 Linkage findings (never scored — the two-index bridge) ─────────────
  for (const f of linkage) {
    if (f.status !== 'confirmed') continue;
    const label = {
      verification: ['verification harness (KPI 13)', 'reverts + rework (KPIs 7/10)'],
      review_loop: ['pre-PR review loop (KPI 14)', 'reverts (KPI 7)'],
      continuity: ['context continuity (KPI 15)', 'iterations + tokens (KPIs 4/6)'],
      skills: ['skills (KPI 12)', 'iterations (KPI 4)'],
    }[f.key];
    out.push({
      kpi_id: 'linkage', hypothesis: 'LINK', channel: 'rec',
      title: `Measured within-person: the ${f.key.replace('_', '-')} gap is costing you outcomes`,
      body: `Your own data, same person, both groups: with ${label[0]} → ${f.withValue}${f.unit.startsWith('%') ? '%' : ` ${f.unit}`} (${f.withCount} ${f.unit === 'avg turns' ? 'sessions' : 'PRs'}); without → ${f.withoutValue}${f.unit.startsWith('%') ? '%' : ` ${f.unit}`} (${f.withoutCount}). Not a hunch — the harness gap predicts the damage in ${label[1]}. Closing it is the highest-leverage move on your main index.`,
      magnitude: { with: f.withValue, without: f.withoutValue, unit: f.unit },
      evidence: { detail: f.detail, with_count: f.withCount, without_count: f.withoutCount },
    });
  }

  return out;
}

function mostCommonRepo(ctx: DevContext): string | null {
  const counts = new Map<string, number>();
  for (const p of ctx.mergedPrs) counts.set(p.repo, (counts.get(p.repo) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [repo, n] of counts) if (n > bestN) { best = repo; bestN = n; }
  return best;
}

/** AI-Leaders recognition — computed separately so the caller can place it. */
export function recognitionInsight(ctx: DevContext, multiplier: number): InsightResult | null {
  if (multiplier < 1) return null;
  return {
    kpi_id: 'skills_authored', hypothesis: 'R1', channel: 'team',
    title: `AI Leader: ${multiplier} engineer${multiplier > 1 ? 's' : ''} run${multiplier > 1 ? '' : 's'} your skill${ctx.skills.length > 1 ? 's' : ''}`,
    body: `Skills you authored were invoked with real output by ${multiplier} other engineer${multiplier > 1 ? 's' : ''} this window. Recognition only — the multiplier is a distinction, not a gradient, so it never enters a weighted score; it does unlock the L5 band gate.`,
    magnitude: { multiplier_signal: multiplier },
    evidence: { skills: ctx.skills.map((s) => s.name) },
  };
}

export const insightPrKeys = (ctx: DevContext): string[] => aiPrs(ctx).map((p) => prKey(p.repo, p.number));
