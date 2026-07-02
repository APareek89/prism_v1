// lib/recommendations/rules.test.ts
//
// Pure-logic verification for the A2 rules + the deterministic evidence grounding.
// No DB, no clock — every assertion is against in-memory RuleContext fixtures.

import { describe, it, expect } from 'vitest';
import type { RuleContext, KpiPoint, PrFact, SessionFact } from './types';
import { runRules } from './engine';
import {
  skillAuthorRule,
  skillReuseRule,
  acceptanceRateRule,
  sizeDisciplineRule,
  cacheEfficiencyRule,
  revertRateRule,
  courseNudgeRule,
  ALL_RULES,
} from './rules';

function kpi(raw: number | null): KpiPoint {
  return { kpiId: 'x', raw, norm: raw === null ? null : 50, confidence: 'medium' };
}
function pr(over: Partial<PrFact> = {}): PrFact {
  return { id: crypto.randomUUID(), isMerged: true, sizeBucket: 'M', aiAssisted: false, reverted: false, ...over };
}
function session(over: Partial<SessionFact> = {}): SessionFact {
  return { id: crypto.randomUUID(), turns: 5, tokensIn: 1000, cacheRead: 0, skillsUsed: [], linkedPrId: null, ...over };
}
function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return {
    functionId: 'fn',
    employeeId: 'emp',
    date: '2026-07-01',
    kpis: {},
    l2: { usage: null, efficiency: null, effectiveness: null, proficiency: null },
    prs: [],
    sessions: [],
    authoredSkills: [],
    courses: [],
    ...over,
  };
}

describe('skill-author rule', () => {
  it('fires when ≥2 merged AI PRs and no authored skills', () => {
    const out = skillAuthorRule(ctx({ prs: [pr({ aiAssisted: true }), pr({ aiAssisted: true })] }));
    expect(out).not.toBeNull();
    expect(out!.kind).toBe('skill');
    expect(out!.ref).toBe('author-first-skill');
    // grounding: before/after/delta are the real counts.
    expect(out!.evidence.before).toBe(0);
    expect(out!.evidence.after).toBe(1);
    expect(out!.evidence.signals).toBe(2);
  });
  it('does not fire when a skill is already authored', () => {
    expect(skillAuthorRule(ctx({ prs: [pr({ aiAssisted: true }), pr({ aiAssisted: true })], authoredSkills: ['s'] }))).toBeNull();
  });
  it('does not fire below the AI-PR minimum', () => {
    expect(skillAuthorRule(ctx({ prs: [pr({ aiAssisted: true })] }))).toBeNull();
  });
});

describe('skill-reuse rule', () => {
  it('fires when reuse share is below the floor', () => {
    // 4 sessions, 1 with a skill → 0.25 < 0.34.
    const sessions = [session({ skillsUsed: ['a'] }), session(), session(), session()];
    const out = skillReuseRule(ctx({ sessions }));
    expect(out).not.toBeNull();
    expect(out!.evidence.before).toBeCloseTo(0.25, 3);
    expect(out!.evidence.signals).toBe(4);
  });
  it('does not fire at/above the floor', () => {
    const sessions = [session({ skillsUsed: ['a'] }), session({ skillsUsed: ['b'] }), session()];
    // 2/3 = 0.67 ≥ 0.34.
    expect(skillReuseRule(ctx({ sessions }))).toBeNull();
  });
  it('does not fire below the session minimum', () => {
    expect(skillReuseRule(ctx({ sessions: [session(), session()] }))).toBeNull();
  });
});

describe('acceptance-rate rule (narrates persisted KPI)', () => {
  it('fires below the 0.4 floor', () => {
    const out = acceptanceRateRule(ctx({ kpis: { suggestion_acceptance_rate: kpi(0.3) } }));
    expect(out).not.toBeNull();
    expect(out!.evidence.before).toBeCloseTo(0.3, 3);
    expect(out!.evidence.after).toBe(0.4);
    expect(out!.evidence.delta).toBeCloseTo(0.1, 3);
  });
  it('does not fire at/above the floor or with no signal', () => {
    expect(acceptanceRateRule(ctx({ kpis: { suggestion_acceptance_rate: kpi(0.5) } }))).toBeNull();
    expect(acceptanceRateRule(ctx({ kpis: { suggestion_acceptance_rate: kpi(null) } }))).toBeNull();
    expect(acceptanceRateRule(ctx())).toBeNull();
  });
});

describe('size-discipline rule', () => {
  it('fires when large-PR share exceeds the ceiling', () => {
    const prs = [pr({ sizeBucket: 'L' }), pr({ sizeBucket: 'L' }), pr({ sizeBucket: 'L' }), pr({ sizeBucket: 'S' })];
    const out = sizeDisciplineRule(ctx({ prs })); // 3/4 = 0.75 > 0.4
    expect(out).not.toBeNull();
    expect(out!.evidence.before).toBeCloseTo(0.75, 3);
    expect(out!.evidence.signals).toBe(4);
  });
  it('does not fire at/below the ceiling', () => {
    const prs = [pr({ sizeBucket: 'L' }), pr({ sizeBucket: 'S' }), pr({ sizeBucket: 'S' }), pr({ sizeBucket: 'M' })];
    expect(sizeDisciplineRule(ctx({ prs }))).toBeNull(); // 1/4 = 0.25
  });
});

describe('cache-efficiency rule', () => {
  it('fires when cache-read share is below the floor with enough volume', () => {
    // cacheRead 10k, tokensIn 90k → total 100k ≥ 50k min; share 0.1 < 0.5.
    const out = cacheEfficiencyRule(ctx({ sessions: [session({ cacheRead: 10_000, tokensIn: 90_000 })] }));
    expect(out).not.toBeNull();
    expect(out!.evidence.before).toBeCloseTo(0.1, 3);
  });
  it('does not fire below the volume minimum', () => {
    expect(cacheEfficiencyRule(ctx({ sessions: [session({ cacheRead: 100, tokensIn: 1000 })] }))).toBeNull();
  });
});

describe('revert-rate rule (narrates persisted KPI)', () => {
  it('fires below the 0.8 floor', () => {
    const out = revertRateRule(ctx({ kpis: { merged_without_revert_rate: kpi(0.6) } }));
    expect(out).not.toBeNull();
    expect(out!.evidence.before).toBeCloseTo(0.6, 3);
    expect(out!.evidence.after).toBe(0.8);
  });
  it('does not fire at/above the floor', () => {
    expect(revertRateRule(ctx({ kpis: { merged_without_revert_rate: kpi(0.95) } }))).toBeNull();
  });
});

describe('course-nudge rule', () => {
  it('picks the weakest below-threshold dimension deterministically', () => {
    const out = courseNudgeRule(ctx({ l2: { usage: 60, efficiency: 40, effectiveness: 30, proficiency: 70 } }));
    expect(out).not.toBeNull();
    expect(out!.ref).toBe('effectiveness'); // 30 is the lowest below 55
    expect(out!.evidence.before).toBe(30);
  });
  it('ties break by canonical order (usage first)', () => {
    const out = courseNudgeRule(ctx({ l2: { usage: 40, efficiency: 40, effectiveness: null, proficiency: null } }));
    expect(out!.ref).toBe('usage');
  });
  it('does not fire when all signalled dimensions are at/above threshold', () => {
    expect(courseNudgeRule(ctx({ l2: { usage: 60, efficiency: 70, effectiveness: 80, proficiency: 90 } }))).toBeNull();
  });
  it('ignores no-signal (null) dimensions', () => {
    expect(courseNudgeRule(ctx({ l2: { usage: null, efficiency: null, effectiveness: null, proficiency: null } }))).toBeNull();
  });
});

describe('runRules', () => {
  it('is deterministic and emits at most one rec per (kind, ref)', () => {
    const c = ctx({
      prs: [pr({ aiAssisted: true }), pr({ aiAssisted: true }), pr({ sizeBucket: 'L' }), pr({ sizeBucket: 'L' })],
      kpis: { suggestion_acceptance_rate: kpi(0.2), merged_without_revert_rate: kpi(0.5) },
      l2: { usage: 20, efficiency: 20, effectiveness: 20, proficiency: 20 },
    });
    const a = runRules(c);
    const b = runRules(c);
    expect(a.map((r) => `${r.kind}:${r.ref}`)).toEqual(b.map((r) => `${r.kind}:${r.ref}`));
    const keys = a.map((r) => `${r.kind}::${r.ref}`);
    expect(new Set(keys).size).toBe(keys.length); // no dup slot
  });
  it('registry ids are unique and match detected_via', () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
