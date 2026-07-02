import { describe, expect, it } from 'vitest';
import { computeLinks, linksByPr } from './link';
import {
  buildContext, kpiAiShare, kpiContinuity, kpiRework, kpiRevert, kpiReliability,
  kpiReviewLoop, kpiSkillsAuthored, kpiTokens, kpiVerification, kpiIterations,
  multiplierSignal, type DevContext,
} from './kpis';
import {
  CATALOG, DEV_A, DEV_B, REPOS, commit, deploy, pr, session, skill,
} from './__fixtures__/mini';
import type { CommitRow, DeployEventRow, PrRow, SessionRow, SkillRow } from '@prism/contract';

const WINDOW = { startIso: '2026-06-04T00:00:00.000Z', endIso: '2026-07-01T23:59:59.999Z' };

function ctxFor(
  prs: PrRow[], sessions: SessionRow[], commits: CommitRow[] = [],
  skills: SkillRow[] = [], deploys: DeployEventRow[] = [], allSessions?: SessionRow[],
): DevContext {
  const links = computeLinks(prs.filter((p) => p.merged_at && !p.is_revert), sessions, commits);
  return buildContext(
    DEV_A,
    { repos: REPOS, prs, commits, sessions, skills, deployEvents: deploys },
    linksByPr(links), WINDOW, allSessions ?? sessions,
  );
}

const exact = (n: number) => ({ pr_refs: [{ repo: 'o/main', number: n }] });

describe('KPI 1 · AI-assisted PR share', () => {
  it('counts AI-linked ÷ merged; revert PRs excluded from both sides', () => {
    const prs = [
      pr({ number: 1 }), pr({ number: 2 }), pr({ number: 3 }),
      pr({ number: 4, is_revert: true, revert_of: 1 }),
    ];
    const s = [session({ session_key: 's1', ...exact(1) }), session({ session_key: 's2', ...exact(2) })];
    const r = kpiAiShare(ctxFor(prs, s), CATALOG);
    expect(r.raw_value).toBe(66.7);   // 2 of 3 (revert PR not a denominator)
    expect(r.signal_count).toBe(3);
    expect(r.score).toBe(33.4);       // (66.7-50)/50
  });

  it('null when nothing merged', () => {
    const r = kpiAiShare(ctxFor([], []), CATALOG);
    expect(r.raw_value).toBeNull();
    expect(r.score).toBeNull();
  });
});

describe('KPI 4 · iterations (exact links only, size-bucketed)', () => {
  it('ignores weak-linked PRs and averages bucket means', () => {
    const prs = [
      pr({ number: 1 }),                                            // S bucket
      pr({ number: 2, files_changed: 14, hunks: 25, modules: 4 }),  // L bucket
      pr({ number: 3, head_ref: 'a/f3' }),                          // branch-linked → excluded
    ];
    const s = [
      session({ session_key: 's1', turns: 4, ...exact(1) }),
      session({ session_key: 's2', turns: 8, ...exact(2) }),
      session({ session_key: 's3', turns: 40, branch: 'a/f3' }),    // must NOT count
    ];
    const r = kpiIterations(ctxFor(prs, s), CATALOG);
    expect(r.signal_count).toBe(2);
    expect(r.raw_value).toBe(6);      // mean(bucket S=4, bucket L=8)
    expect(r.score).toBe(66.7);
  });
});

describe('KPI 6 · tokens (in-scope only, cache + exploration diagnostics)', () => {
  it('scores in-scope tokens ÷ merged PRs; exploration visible, never scored', () => {
    const prs = [pr({ number: 1 })];
    const s = [
      session({ session_key: 'in', tokens_in: 28_000, tokens_out: 12_000, cache_read_tokens: 10_000 }),
      session({ session_key: 'out', repo: 'o/labs', tokens_in: 700_000, tokens_out: 300_000 }),
    ];
    const r = kpiTokens(ctxFor(prs, s), CATALOG);
    expect(r.raw_value).toBe(40);              // 40k in-scope ÷ 1 PR — labs 1M ignored
    expect(r.score).toBe(83.3);
    expect(r.meta.exploration_k).toBe(1000);
    expect(r.meta.cache_read_share).toBe(26.3); // 10k / 38k
  });
});

describe('KPI 7 · merged without revert (ALL post-merge reverts count)', () => {
  const aiPr = (n: number, mergedAt: string) => pr({ number: n, merged_at: mergedAt });
  const linkSession = (n: number) => session({ session_key: `s${n}`, ...exact(n) });

  it('counts self-caught AND other-caught; who-caught is meta only', () => {
    const prs = [
      aiPr(1, '2026-06-10T00:00:00Z'), aiPr(2, '2026-06-10T00:00:00Z'),
      pr({ number: 10, is_revert: true, revert_of: 1, developer_id: DEV_A.id, merged_at: '2026-06-12T00:00:00Z' }),
      pr({ number: 11, is_revert: true, revert_of: 2, developer_id: DEV_B.id, merged_at: '2026-06-13T00:00:00Z' }),
    ];
    const r = kpiRevert(ctxFor(prs, [linkSession(1), linkSession(2)]), CATALOG);
    expect(r.raw_value).toBe(0);      // both reverted → 0% survived
    expect(r.score).toBe(0);
    const reverted = r.meta.reverted as Array<{ caught_by: string }>;
    expect(reverted.map((x) => x.caught_by).sort()).toEqual(['other', 'self']);
    expect(r.meta.small_sample).toBe(true);
  });

  it('a revert outside the 14-day window does not count', () => {
    const prs = [
      aiPr(1, '2026-06-05T00:00:00Z'),
      pr({ number: 10, is_revert: true, revert_of: 1, merged_at: '2026-06-25T00:00:00Z' }),
    ];
    const r = kpiRevert(ctxFor(prs, [linkSession(1)]), CATALOG);
    expect(r.raw_value).toBe(100);
  });
});

describe('KPI 9 · change reliability (Tier-1 evidence ladder)', () => {
  it('rollback + hotfix ≤48h count; tier badge T1; batch blur flagged', () => {
    const prs = [pr({ number: 1, merge_sha: 'sha-1' }), pr({ number: 2, merge_sha: 'sha-2' })];
    const s = [session({ session_key: 's1', ...exact(1) }), session({ session_key: 's2', ...exact(2) })];
    const deploys = [
      deploy({ deploy_key: 'd1', merge_shas: ['sha-1'], deployed_at: '2026-06-11T00:00:00Z' }),
      deploy({ deploy_key: 'rb', kind: 'rollback', rollback_of: 'd1', deployed_at: '2026-06-11T06:00:00Z' }),
      deploy({ deploy_key: 'd2', merge_shas: ['sha-2', 'other-sha'], deployed_at: '2026-06-12T00:00:00Z' }),
      deploy({ deploy_key: 'hf', fix_tagged: true, deployed_at: '2026-06-13T12:00:00Z' }),  // +36h
    ];
    const r = kpiReliability(ctxFor(prs, s, [], [], deploys), CATALOG);
    expect(r.raw_value).toBe(100);    // both AI deploys failed
    expect(r.tier).toBe('T1');
    expect(r.meta.batch_blur).toBe(true);   // d2 carried 2 PRs
  });

  it('a fix-tagged deploy AFTER 48h does not fail the deploy; null with no AI deploys', () => {
    const prs = [pr({ number: 1, merge_sha: 'sha-1' })];
    const s = [session({ session_key: 's1', ...exact(1) })];
    const deploys = [
      deploy({ deploy_key: 'd1', merge_shas: ['sha-1'], deployed_at: '2026-06-11T00:00:00Z' }),
      deploy({ deploy_key: 'late', fix_tagged: true, deployed_at: '2026-06-14T00:00:00Z' }),  // +72h
    ];
    expect(kpiReliability(ctxFor(prs, s, [], [], deploys), CATALOG).raw_value).toBe(0);
    expect(kpiReliability(ctxFor(prs, s, [], [], []), CATALOG).raw_value).toBeNull();
  });
});

describe('KPI 10 · rework (evidence ladder + wip exclusion + 14d)', () => {
  it('bug-link, fix:-type and pattern tiers count; wip-increment PRs excluded', () => {
    const prs = [
      pr({ number: 1, merged_at: '2026-06-10T00:00:00Z' }),
      pr({ number: 2, merged_at: '2026-06-10T00:00:00Z' }),
      pr({ number: 3, merged_at: '2026-06-10T00:00:00Z', labels: ['wip-increment'] }),
      pr({ number: 4, merged_at: '2026-06-10T00:00:00Z' }),
    ];
    const commits = [
      commit({ sha: 'f1', hunk_overlap_pr: 1, linked_issue_kind: 'bug', message: 'resolve overflow (#901)', authored_at: '2026-06-12T00:00:00Z' }),
      commit({ sha: 'f2', hunk_overlap_pr: 2, message: 'fix: edge case', authored_at: '2026-06-13T00:00:00Z' }),
      commit({ sha: 'f3', hunk_overlap_pr: 3, message: 'fix: wip follow-up', authored_at: '2026-06-13T00:00:00Z' }),  // excluded PR
      commit({ sha: 'f4', hunk_overlap_pr: 4, message: 'fix: too late', authored_at: '2026-06-30T00:00:00Z' }),        // >14d
    ];
    const r = kpiRework(ctxFor(prs, [], commits), CATALOG);
    expect(r.signal_count).toBe(3);   // 4 merged − 1 wip
    expect(r.raw_value).toBe(66.7);   // PRs 1+2 reworked of 3 eligible
    expect(r.meta.excluded_wip).toBe(1);
    const tiers = (r.meta.pairs as Array<{ tier: string }>).map((p) => p.tier).sort();
    expect(tiers).toEqual(['fix_type', 'issue_link']);
  });

  it('a plain refactor commit on the same hunks is NOT rework (no fix evidence)', () => {
    const prs = [pr({ number: 1, merged_at: '2026-06-10T00:00:00Z' })];
    const commits = [commit({ sha: 'r1', hunk_overlap_pr: 1, message: 'refactor: tidy imports', authored_at: '2026-06-12T00:00:00Z' })];
    expect(kpiRework(ctxFor(prs, [], commits), CATALOG).raw_value).toBe(0);
  });
});

describe('KPI 12 · skills authored (execution evidence) + multiplier signal', () => {
  it('only skills invoked with real output count; foreign invocations power the multiplier', () => {
    const mySkills = [skill({ name: 'api-client' }), skill({ name: 'empty-skill' })];
    const mine = session({ session_key: 'mine', skill_invocations: [{ name: 'api-client', had_output: true }] });
    const theirs = session({
      session_key: 'theirs', developer_id: DEV_B.id,
      skill_invocations: [{ name: 'api-client', had_output: true }],
    });
    const ctx = ctxFor([], [mine], [], mySkills, [], [mine, theirs]);
    const r = kpiSkillsAuthored(ctx, CATALOG);
    expect(r.raw_value).toBe(1);            // empty-skill never invoked → no credit
    expect(r.score).toBe(33.3);
    expect(multiplierSignal(ctx)).toBe(1);  // dev B ran my skill → L5 gate unlocks
  });
});

describe('KPI 13 · verification rate + breadth (repo applicability)', () => {
  it('rate = verified AI PRs ÷ AI PRs; breadth = used ÷ applicable (no lint in repo → 3 applicable)', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 })];
    const s = [
      session({
        session_key: 's1', ...exact(1),
        verification_events: [
          { category: 'V1', cmd: 'npm run build', duration_ms: 900, exit_code: 0 },
          { category: 'V2', cmd: 'npm test', duration_ms: 5000, exit_code: 0 },
        ],
      }),
      session({ session_key: 's2', ...exact(2) }),
    ];
    const r = kpiVerification(ctxFor(prs, s), CATALOG);
    expect(r.raw_value).toBe(50);
    expect(r.score).toBe(40);
    expect(r.meta.breadth_pct).toBe(66.7);  // V1+V2 of {V1,V2,V4} (o/main has no lint)
  });
});

describe('KPI 14 · review loop (theater guard)', () => {
  it('counts diff-change or explicit no-findings; theater earns nothing', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 }), pr({ number: 3 })];
    const s = [
      session({ session_key: 's1', ...exact(1), review_pass: { ran: true, diff_changed: true, findings: 2 } }),
      session({ session_key: 's2', ...exact(2), review_pass: { ran: true, diff_changed: false, findings: 0 } }),
      session({ session_key: 's3', ...exact(3), review_pass: { ran: true, diff_changed: false, findings: null } }),
    ];
    const r = kpiReviewLoop(ctxFor(prs, s), CATALOG);
    expect(r.raw_value).toBe(66.7);         // s3 is theater
    expect(r.meta.theater_passes).toBe(1);
  });
});

describe('KPI 15 · continuity (connected repos only)', () => {
  it('warm ÷ connected sessions; labs sessions excluded', () => {
    const s = [
      session({ session_key: 'w', context_read_at_start: true }),
      session({ session_key: 'c1', first_prompt_chars: 1800 }),
      session({ session_key: 'c2', first_prompt_chars: 1900 }),
      session({ session_key: 'labs', repo: 'o/labs', context_read_at_start: true }),
    ];
    const r = kpiContinuity(ctxFor([], s), CATALOG);
    expect(r.raw_value).toBe(33.3);
    expect(r.meta.avg_cold_first_prompt_chars).toBe(1850);
  });
});
