import { describe, it, expect } from 'vitest';
import { computeDaily } from './compute-daily';
import {
  strongMember,
  weakMember,
  midMember,
  emptyMember,
  threeMemberCohort,
  sizingPrs,
} from './__fixtures__/rows';

const DATE = '2026-06-30';

describe('compute-daily — empty member', () => {
  it('yields Insufficient confidence + suppressed L1 + L0 band (no fabricated numbers)', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: [emptyMember()],
      sizingPrs: [],
    });
    const m = out.members[0]!;
    expect(m.l1).toBeNull();
    expect(m.confidence.band).toBe('insufficient');
    expect(m.confidence.shouldSuppressL1).toBe(true);
    expect(m.band).toBe('L0');
    expect(m.tokensPerPr.tokensPerPr).toBeNull();
  });

  it('empty cohort → function L1 suppressed', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: [emptyMember('e1'), emptyMember('e2')],
      sizingPrs: [],
    });
    expect(out.function.l1).toBeNull();
    expect(out.function.confidence.shouldSuppressL1).toBe(true);
  });
});

describe('compute-daily — single strong member (N=1 path)', () => {
  it('produces a computed L1 and stamps config_version', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: [strongMember()],
      sizingPrs: sizingPrs(),
    });
    const m = out.members[0]!;
    // N=1 cohort drops one confidence band, but the strong member meets enough
    // dimension thresholds that L1 is not suppressed.
    expect(m.l1).not.toBeNull();
    expect(m.configVersion).toBe('v1');
    // function L1 equals the single member's L1 (median of one) when not suppressed.
    expect(out.function.l1).toBe(m.l1);
  });

  it('emits a kpi_daily row per KPI plus an index_daily row for member + function', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: [strongMember()],
      sizingPrs: sizingPrs(),
    });
    // 13 KPIs computed for one member (12 + the iterations KPI counts once).
    expect(out.kpiDaily.length).toBe(13);
    // one member row + one function row.
    expect(out.indexDaily.length).toBe(2);
    expect(out.indexDaily.some((r) => r.scope === 'function')).toBe(true);
    expect(out.indexDaily.every((r) => r.configVersion === 'v1')).toBe(true);
  });
});

describe('compute-daily — N=3 multi-member cohort', () => {
  it('function L1 is the median member L1 (mid), robust to weak/strong extremes', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: threeMemberCohort(), // [weak, mid, strong]
      sizingPrs: sizingPrs(),
    });

    const byId = new Map(out.members.map((m) => [m.scopeId, m]));
    const weak = byId.get('weak')!;
    const mid = byId.get('mid')!;
    const strong = byId.get('strong')!;

    // sanity: strong scores higher than weak on L1 (when both computed).
    if (weak.l1 !== null && strong.l1 !== null) {
      expect(strong.l1).toBeGreaterThan(weak.l1);
    }

    // function L1 = median of the three member L1s.
    const l1s = [weak.l1, mid.l1, strong.l1].filter(
      (x): x is number => x !== null,
    );
    l1s.sort((a, b) => a - b);
    const expectedMedian =
      l1s.length === 3 ? l1s[1] : l1s.length ? l1s[Math.floor(l1s.length / 2)] : null;
    expect(out.function.l1).toBe(expectedMedian);
    expect(out.function.memberCount).toBe(3);
  });

  it('emits kpi_daily for every member and an index_daily row for each member + function', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: threeMemberCohort(),
      sizingPrs: sizingPrs(),
    });
    expect(out.kpiDaily.length).toBe(3 * 13);
    expect(out.indexDaily.length).toBe(3 + 1);
  });
});

describe('compute-daily — determinism', () => {
  it('is a pure function of its inputs (same input → identical output)', () => {
    const args = {
      date: DATE,
      functionId: 'fn',
      members: threeMemberCohort(),
      sizingPrs: sizingPrs(),
    };
    const a = computeDaily(args);
    const b = computeDaily(args);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('uses the cold-start sizing fallback when no sizing PRs are supplied', () => {
    const out = computeDaily({
      date: DATE,
      functionId: 'fn',
      members: [midMember()],
      sizingPrs: [],
    });
    // still computes — cold-start thresholds keep the pipeline running.
    expect(out.indexDaily.length).toBe(2);
  });
});
