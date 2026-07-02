import { describe, it, expect } from 'vitest';
import {
  scoreMatch,
  prLinkMatch,
  branchMatch,
  shaOverlap,
  coauthorMatch,
  METHOD_CONFIDENCE,
  type PrKeys,
  type SessionKeys,
} from './match-keys';

// ─────────────────────────────────────────────────────────────────────────────
// pr_link — the exact first-party session→PR identity (the fix). Strongest signal.
// ─────────────────────────────────────────────────────────────────────────────

describe('prLinkMatch — exact (repo, number) identity', () => {
  const prRef = { repo: 'APareek89/prism', number: 8 };

  it('matches when a session pr-ref equals the PR (same repo + number)', () => {
    expect(prLinkMatch(prRef, [{ repo: 'APareek89/prism', number: 8 }])).toBe(true);
  });

  it('matches case-insensitively on the repo slug', () => {
    expect(prLinkMatch(prRef, [{ repo: 'apareek89/PRISM', number: 8 }])).toBe(true);
  });

  it('picks the right PR out of a multi-PR session (session opened 1..8)', () => {
    const refs = Array.from({ length: 8 }, (_, i) => ({ repo: 'APareek89/prism', number: i + 1 }));
    expect(prLinkMatch({ repo: 'APareek89/prism', number: 5 }, refs)).toBe(true);
    expect(prLinkMatch({ repo: 'APareek89/prism', number: 9 }, refs)).toBe(false);
  });

  it('does NOT match a different PR number in the same repo', () => {
    expect(prLinkMatch(prRef, [{ repo: 'APareek89/prism', number: 7 }])).toBe(false);
  });

  it('does NOT match the same number in a DIFFERENT repo (repo-scoped)', () => {
    expect(prLinkMatch(prRef, [{ repo: 'APareek89/other', number: 8 }])).toBe(false);
  });

  it('never matches when repo or number is missing on either side', () => {
    expect(prLinkMatch({ repo: 'APareek89/prism', number: undefined }, [{ repo: 'APareek89/prism', number: 8 }])).toBe(false);
    expect(prLinkMatch({ repo: null, number: 8 }, [{ repo: 'APareek89/prism', number: 8 }])).toBe(false);
    expect(prLinkMatch(prRef, [{ repo: '', number: 8 }])).toBe(false);
    expect(prLinkMatch(prRef, [{ repo: 'APareek89/prism', number: undefined }])).toBe(false);
  });

  it('is safe with empty / missing session refs and missing PR ref', () => {
    expect(prLinkMatch(prRef, [])).toBe(false);
    expect(prLinkMatch(prRef, undefined)).toBe(false);
    expect(prLinkMatch(undefined, [{ repo: 'APareek89/prism', number: 8 }])).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreMatch — precedence pr_link > sha > branch > coauthor + confidences.
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreMatch — method precedence + confidence', () => {
  it('returns pr_link at 0.99 when the pr-link identity fires', () => {
    const pr: PrKeys = {
      ref: { repo: 'APareek89/prism', number: 8 },
      headRef: 'chore/claude-md',
      mergeSha: 'aa808d5bf2572806dc3796b9b06bde55542201a9',
      coauthorShas: ['aa808d5bf2572806dc3796b9b06bde55542201a9'],
    };
    const session: SessionKeys = {
      prRefs: [{ repo: 'APareek89/prism', number: 8 }],
      branch: 'chore/claude-md',
      hasCoauthorTrailer: true,
    };
    expect(scoreMatch(pr, session)).toEqual({ method: 'pr_link', confidence: 0.99 });
  });

  it('pr_link outranks a simultaneous sha match', () => {
    const pr: PrKeys = {
      ref: { repo: 'APareek89/prism', number: 1 },
      headRef: 'chore/demo-reset-script',
      mergeSha: 'fa1f2d67d9b9c3c2a973d5eb790b39484514652c',
    };
    const session: SessionKeys = {
      prRefs: [{ repo: 'APareek89/prism', number: 1 }],
      branch: null,
      shas: ['fa1f2d67d9b9c3c2a973d5eb790b39484514652c'],
    };
    expect(scoreMatch(pr, session).method).toBe('pr_link');
  });

  it('falls back to sha when there is no pr-link ref', () => {
    const pr: PrKeys = { headRef: 'feat/x', mergeSha: 'abcdef1234567890' };
    const session: SessionKeys = { branch: 'feat/x', shas: ['abcdef1234567890'] };
    expect(scoreMatch(pr, session)).toEqual({ method: 'sha', confidence: METHOD_CONFIDENCE.sha });
  });

  it('falls back to branch when neither pr-link nor sha fire', () => {
    const pr: PrKeys = { headRef: 'docs/testing-guide', mergeSha: 'deadbeefdeadbeef' };
    const session: SessionKeys = { branch: 'docs/testing-guide', shas: ['0000000000000000'] };
    expect(scoreMatch(pr, session)).toEqual({ method: 'branch', confidence: METHOD_CONFIDENCE.branch });
  });

  it('falls back to coauthor last', () => {
    const pr: PrKeys = { headRef: 'a', mergeSha: 'x', coauthorShas: ['c0ffee1234567'] };
    const session: SessionKeys = { branch: 'b', hasCoauthorTrailer: true };
    expect(scoreMatch(pr, session)).toEqual({ method: 'coauthor', confidence: METHOD_CONFIDENCE.coauthor });
  });

  it('returns no method when nothing fires', () => {
    const pr: PrKeys = { headRef: 'a', mergeSha: 'x' };
    const session: SessionKeys = { branch: 'b' };
    expect(scoreMatch(pr, session)).toEqual({ method: null, confidence: 0 });
  });

  it('does NOT pr_link-match when the session names a different repo (no false link)', () => {
    const pr: PrKeys = { ref: { repo: 'APareek89/prism', number: 8 }, headRef: null, mergeSha: null };
    const session: SessionKeys = { prRefs: [{ repo: 'APareek89/prism', number: 7 }], branch: null };
    expect(scoreMatch(pr, session).method).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Confidence ordering — pr_link is strictly the strongest.
// ─────────────────────────────────────────────────────────────────────────────

describe('METHOD_CONFIDENCE ordering', () => {
  it('ranks pr_link > sha > branch > coauthor', () => {
    expect(METHOD_CONFIDENCE.pr_link).toBeGreaterThan(METHOD_CONFIDENCE.sha);
    expect(METHOD_CONFIDENCE.sha).toBeGreaterThan(METHOD_CONFIDENCE.branch);
    expect(METHOD_CONFIDENCE.branch).toBeGreaterThan(METHOD_CONFIDENCE.coauthor);
  });
  it('keeps every confidence in (0,1]', () => {
    for (const c of Object.values(METHOD_CONFIDENCE)) {
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: the pre-existing signals still behave as before.
// ─────────────────────────────────────────────────────────────────────────────

describe('existing signals — regression', () => {
  it('branchMatch is case-insensitive and null-safe', () => {
    expect(branchMatch('Feature/X', 'feature/x')).toBe(true);
    expect(branchMatch('HEAD', 'HEAD')).toBe(true); // still equal as strings
    expect(branchMatch(null, 'x')).toBe(false);
    expect(branchMatch('x', undefined)).toBe(false);
  });

  it('shaOverlap is prefix-aware (short vs full)', () => {
    expect(shaOverlap('abcdef1234567890', ['abcdef1'])).toBe(true);
    expect(shaOverlap('abcdef1234567890', ['abcde'])).toBe(false); // < 7 chars, no match
    expect(shaOverlap(null, ['abcdef1'])).toBe(false);
    expect(shaOverlap('abcdef1234567890', undefined)).toBe(false);
  });

  it('coauthorMatch: sha-in-coauthor-set OR trailer+coauthored-PR fallback', () => {
    expect(
      coauthorMatch({ headRef: null, mergeSha: null, coauthorShas: ['deadbeef1234567'] }, { branch: null, shas: ['deadbeef1234567'] }),
    ).toBe(true);
    expect(
      coauthorMatch({ headRef: null, mergeSha: null, coauthorShas: ['deadbeef1234567'] }, { branch: null, hasCoauthorTrailer: true }),
    ).toBe(true);
    expect(
      coauthorMatch({ headRef: null, mergeSha: null, coauthorShas: [] }, { branch: null, hasCoauthorTrailer: true }),
    ).toBe(false);
  });
});
