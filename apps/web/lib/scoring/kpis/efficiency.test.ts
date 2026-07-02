import { describe, it, expect } from 'vitest';
import {
  aiIterationsToMerge,
  suggestionAcceptanceRate,
  tokensToShipped,
  type PrBucketMap,
} from './efficiency';
import type { SizeBucket } from '../types';
import { makeMember, makePr, makeSession } from '../__fixtures__/rows';

function bucketMap(entries: Array<[string, SizeBucket]>): PrBucketMap {
  return new Map(entries);
}

describe('efficiency.aiIterationsToMerge (within S/M/L)', () => {
  it('averages turns-per-PR within buckets, then averages bucket means', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'small', isMerged: true }),
        makePr({ prId: 'large', isMerged: true }),
      ],
      sessions: [
        makeSession({ sessionId: 's1', linkedPrId: 'small', turns: 2 }),
        makeSession({ sessionId: 's2', linkedPrId: 'large', turns: 10 }),
      ],
    });
    const k = aiIterationsToMerge(
      m,
      bucketMap([
        ['small', 'S'],
        ['large', 'L'],
      ]),
    );
    // S-bucket mean = 2, L-bucket mean = 10 → average of bucket means = 6.
    expect(k.value).toBe(6);
    expect(k.signals).toBe(2);
  });

  it('sums turns across multiple sessions linked to the same PR', () => {
    const m = makeMember({
      prs: [makePr({ prId: 'p', isMerged: true })],
      sessions: [
        makeSession({ sessionId: 's1', linkedPrId: 'p', turns: 3 }),
        makeSession({ sessionId: 's2', linkedPrId: 'p', turns: 4 }),
      ],
    });
    const k = aiIterationsToMerge(m, bucketMap([['p', 'M']]));
    expect(k.value).toBe(7);
  });

  it('is null when no merged PR has a linked session', () => {
    const m = makeMember({
      prs: [makePr({ prId: 'p', isMerged: true })],
      sessions: [makeSession({ sessionId: 's1', linkedPrId: null, turns: 5 })],
    });
    expect(aiIterationsToMerge(m, bucketMap([['p', 'M']])).value).toBeNull();
  });
});

describe('efficiency.suggestionAcceptanceRate', () => {
  it('is accepted ÷ offered across sessions', () => {
    const m = makeMember({
      sessions: [
        makeSession({ sessionId: 's1', suggestionsOffered: 10, suggestionsAccepted: 7 }),
        makeSession({ sessionId: 's2', suggestionsOffered: 10, suggestionsAccepted: 3 }),
      ],
    });
    const k = suggestionAcceptanceRate(m);
    expect(k.value).toBe(0.5);
    expect(k.signals).toBe(2);
  });
  it('is null when nothing was offered', () => {
    const m = makeMember({
      sessions: [makeSession({ suggestionsOffered: 0, suggestionsAccepted: 0 })],
    });
    expect(suggestionAcceptanceRate(m).value).toBeNull();
  });
});

describe('efficiency.tokensToShipped', () => {
  it('is total tokens ÷ merged PRs', () => {
    const m = makeMember({
      prs: [makePr({ prId: 'a', isMerged: true }), makePr({ prId: 'b', isMerged: true })],
      sessions: [
        makeSession({ sessionId: 's1', tokensIn: 8000, tokensOut: 2000 }),
        makeSession({ sessionId: 's2', tokensIn: 6000, tokensOut: 4000 }),
      ],
    });
    // total 20000 ÷ 2 merged = 10000
    expect(tokensToShipped(m).value).toBe(10000);
  });
  it('is null with no merged PRs', () => {
    const m = makeMember({ prs: [makePr({ isMerged: false })] });
    expect(tokensToShipped(m).value).toBeNull();
  });
});
