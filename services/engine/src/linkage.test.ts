import { describe, expect, it } from 'vitest';
import { computeLinks, linksByPr } from './link';
import { buildContext } from './kpis';
import { runLinkage } from './linkage';
import { DEV_A, REPOS, pr, session } from './__fixtures__/mini';
import type { PrRow, SessionRow } from '@prism/contract';

const WINDOW = { startIso: '2026-06-04T00:00:00.000Z', endIso: '2026-07-01T23:59:59.999Z' };
const exact = (n: number) => ({ pr_refs: [{ repo: 'o/main', number: n }] });

function ctxFor(prs: PrRow[], sessions: SessionRow[]) {
  const links = computeLinks(prs.filter((p) => p.merged_at && !p.is_revert), sessions, []);
  return buildContext(DEV_A, { repos: REPOS, prs, commits: [], sessions, skills: [], deployEvents: [] },
    linksByPr(links), WINDOW, sessions);
}

const verifEvent = [{ category: 'V2' as const, cmd: 'npm test', duration_ms: 4000, exit_code: 0 }];

describe('🔗 linkage engine — within-person, never scored', () => {
  it('confirms the verification link when unverified PRs go bad and verified ones survive', () => {
    const prs: PrRow[] = [];
    const sessions: SessionRow[] = [];
    // 2 verified PRs, clean.
    for (const n of [1, 2]) {
      prs.push(pr({ number: n, merged_at: '2026-06-10T00:00:00Z' }));
      sessions.push(session({ session_key: `v${n}`, ...exact(n), verification_events: verifEvent }));
    }
    // 3 unverified PRs, 2 reverted.
    for (const n of [3, 4, 5]) {
      prs.push(pr({ number: n, merged_at: '2026-06-12T00:00:00Z' }));
      sessions.push(session({ session_key: `u${n}`, ...exact(n) }));
    }
    prs.push(pr({ number: 10, is_revert: true, revert_of: 3, merged_at: '2026-06-14T00:00:00Z' }));
    prs.push(pr({ number: 11, is_revert: true, revert_of: 4, merged_at: '2026-06-14T00:00:00Z' }));

    const finding = runLinkage(ctxFor(prs, sessions)).find((f) => f.key === 'verification')!;
    expect(finding.status).toBe('confirmed');
    expect(finding.withValue).toBe(0);       // verified: 0% bad
    expect(finding.withoutValue).toBe(66.7); // unverified: 2 of 3 bad
  });

  it('reports honest INSUFFICIENT when a group is empty — never 0', () => {
    const prs = [pr({ number: 1, merged_at: '2026-06-10T00:00:00Z' })];
    const sessions = [session({ session_key: 'u1', ...exact(1) })];   // no verified group
    const finding = runLinkage(ctxFor(prs, sessions)).find((f) => f.key === 'verification')!;
    expect(finding.status).toBe('insufficient');
  });

  it('confirms the continuity link when cold sessions take ~2× the turns of warm ones', () => {
    const sessions = [
      session({ session_key: 'w1', context_read_at_start: true, turns: 4 }),
      session({ session_key: 'w2', context_read_at_start: true, turns: 4 }),
      session({ session_key: 'w3', context_read_at_start: true, turns: 5 }),
      session({ session_key: 'c1', turns: 9 }),
      session({ session_key: 'c2', turns: 10 }),
      session({ session_key: 'c3', turns: 8 }),
    ];
    const finding = runLinkage(ctxFor([], sessions)).find((f) => f.key === 'continuity')!;
    expect(finding.status).toBe('confirmed');
    expect(finding.withoutValue).toBeGreaterThan(finding.withValue!);
  });

  it('reports no_edge when both groups behave the same', () => {
    const sessions = [
      session({ session_key: 'w1', context_read_at_start: true, turns: 5 }),
      session({ session_key: 'w2', context_read_at_start: true, turns: 5 }),
      session({ session_key: 'w3', context_read_at_start: true, turns: 5 }),
      session({ session_key: 'c1', turns: 5 }),
      session({ session_key: 'c2', turns: 6 }),
      session({ session_key: 'c3', turns: 5 }),
    ];
    const finding = runLinkage(ctxFor([], sessions)).find((f) => f.key === 'continuity')!;
    expect(finding.status).toBe('no_edge');
  });
});
