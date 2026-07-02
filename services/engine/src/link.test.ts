import { describe, expect, it } from 'vitest';
import { computeLinks } from './link';
import { DEV_A, DEV_B, pr, session, commit } from './__fixtures__/mini';

describe('AI→PR link ladder + hardening', () => {
  it('strongest signal wins: pr_link beats branch on the same pair', () => {
    const p = pr({ number: 1, head_ref: 'a/f1' });
    const s = session({ session_key: 's1', branch: 'a/f1', pr_refs: [{ repo: 'o/main', number: 1 }] });
    const links = computeLinks([p], [s], []);
    expect(links).toHaveLength(1);
    expect(links[0]!.method).toBe('pr_link');
    expect(links[0]!.confidence).toBe(0.99);
  });

  it('sha prefix match at 0.95; branch match is case-insensitive at 0.80', () => {
    const p1 = pr({ number: 1, merge_sha: 'abcdef1234567890' });
    const p2 = pr({ number: 2, head_ref: 'A/Feature-X', merge_sha: 'zzz' });
    const s1 = session({ session_key: 's1', sha_refs: ['abcdef123456'] });
    const s2 = session({ session_key: 's2', branch: 'a/feature-x' });
    const links = computeLinks([p1, p2], [s1, s2], []);
    expect(links.find((l) => l.session_id === s1.id && l.pr_number === 1)?.method).toBe('sha');
    expect(links.find((l) => l.session_id === s2.id && l.pr_number === 2)?.method).toBe('branch');
  });

  it('coauthor fallback fires repo-scoped — and is SUPPRESSED when pr_link covers the PR', () => {
    const p = pr({ number: 1 });
    const marker = session({ session_key: 'exact', pr_refs: [{ repo: 'o/main', number: 1 }] });
    const drifter = session({ session_key: 'drifter', branch: 'other' });
    const co = commit({ sha: 'x1', pr_number: 1, co_authored_by_claude: true });
    const links = computeLinks([p], [marker, drifter], [co]);
    const coLink = links.find((l) => l.method === 'coauthor');
    expect(coLink).toBeDefined();
    expect(coLink!.suppressed).toBe(true);         // the v3 hardening rule
    expect(links.find((l) => l.method === 'pr_link')!.suppressed).toBe(false);
  });

  it('coauthor stays active when NO exact link covers the PR', () => {
    const p = pr({ number: 1 });
    const drifter = session({ session_key: 'drifter', branch: 'other' });
    const co = commit({ sha: 'x1', pr_number: 1, co_authored_by_claude: true });
    const links = computeLinks([p], [drifter], [co]);
    expect(links).toHaveLength(1);
    expect(links[0]!.method).toBe('coauthor');
    expect(links[0]!.suppressed).toBe(false);
  });

  it('a session never links to another developer\'s PR (attribution sanity)', () => {
    const p = pr({ number: 1, developer_id: DEV_A.id });
    const foreign = session({ session_key: 'sb', developer_id: DEV_B.id, pr_refs: [{ repo: 'o/main', number: 1 }] });
    expect(computeLinks([p], [foreign], [])).toHaveLength(0);
  });

  it('revert PRs and unmerged PRs are never linked', () => {
    const rev = pr({ number: 2, is_revert: true, revert_of: 1 });
    const open = pr({ number: 3, merged_at: null });
    const s = session({ session_key: 's1', pr_refs: [{ repo: 'o/main', number: 2 }, { repo: 'o/main', number: 3 }] });
    expect(computeLinks([rev, open], [s], [])).toHaveLength(0);
  });
});
