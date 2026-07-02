import { describe, it, expect } from 'vitest';
import {
  aiAssistedPrShare,
  agenticDepthShare,
  toolSessionCadence,
  usageKpis,
} from './usage';
import { makeMember, makePr, makeSession } from '../__fixtures__/rows';

describe('usage.aiAssistedPrShare', () => {
  it('is linked merged PRs ÷ merged PRs', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', isMerged: true, aiLinked: true }),
        makePr({ prId: 'b', isMerged: true, aiLinked: false }),
      ],
    });
    const k = aiAssistedPrShare(m);
    expect(k.value).toBe(0.5);
    expect(k.signals).toBe(2);
  });
  it('is null when there are no merged PRs (no fabricated rate)', () => {
    const m = makeMember({ prs: [makePr({ isMerged: false })] });
    expect(aiAssistedPrShare(m).value).toBeNull();
  });
});

describe('usage.agenticDepthShare', () => {
  it('is majority-AI merged PRs ÷ merged PRs', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', agenticMajority: true }),
        makePr({ prId: 'b', agenticMajority: true }),
        makePr({ prId: 'c', agenticMajority: false }),
      ],
    });
    const k = agenticDepthShare(m);
    expect(k.value).toBeCloseTo(2 / 3, 6);
  });
});

describe('usage.toolSessionCadence', () => {
  it('is distinct active days ÷ working days', () => {
    const m = makeMember({
      meta: { memberId: 'm-1', workingDays: 10 },
      sessions: [
        makeSession({ sessionId: 's1', day: '2026-06-01' }),
        makeSession({ sessionId: 's2', day: '2026-06-01' }), // same day → 1 distinct
        makeSession({ sessionId: 's3', day: '2026-06-02' }),
      ],
    });
    const k = toolSessionCadence(m);
    expect(k.value).toBe(2 / 10);
    expect(k.signals).toBe(3); // signals = session count
  });
});

describe('usage.usageKpis', () => {
  it('returns all three usage KPIs tagged to the usage dimension', () => {
    const ks = usageKpis(makeMember());
    expect(ks).toHaveLength(3);
    expect(ks.every((k) => k.dimension === 'usage')).toBe(true);
  });
});
