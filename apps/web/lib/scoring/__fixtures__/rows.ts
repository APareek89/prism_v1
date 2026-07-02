// lib/scoring/__fixtures__/rows.ts
//
// Deterministic, test-only synthetic inputs. NEVER imported by non-test code (the
// engine reads real rows; these are for unit tests only). Builders produce valid
// MemberRawRows so tests can compose scenarios without repeating boilerplate.

import type {
  DeployRow,
  MemberRawRows,
  PrRow,
  SessionRow,
  SkillAuthorshipRow,
} from '../types';

/** A merged, AI-linked, healthy PR with sensible defaults; override any field. */
export function makePr(overrides: Partial<PrRow> = {}): PrRow {
  return {
    prId: 'pr-1',
    files: 3,
    hunks: 4,
    modules: 1,
    blast: 0,
    isMerged: true,
    aiLinked: true,
    revertedWithin14d: false,
    aiLinesMerged: 100,
    aiLinesAliveAt30d: 90,
    agenticMajority: true,
    defectReworkWithin14d: false,
    isSelfRevert: false,
    hasFeatureLabel: true,
    ...overrides,
  };
}

/** A productive CC session with sensible defaults; override any field. */
export function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    sessionId: 'sess-1',
    linkedPrId: 'pr-1',
    day: '2026-06-01',
    turns: 4,
    tokensIn: 8000,
    tokensOut: 2000,
    cacheRead: 6000,
    cacheCreation: 1000,
    suggestionsOffered: 10,
    suggestionsAccepted: 7,
    skillsUsed: ['tests.skill.md'],
    producedOutput: true,
    excludedFromAiRates: false,
    ...overrides,
  };
}

export function makeDeploy(overrides: Partial<DeployRow> = {}): DeployRow {
  return {
    deployId: 'dep-1',
    aiAssisted: true,
    changeFailed: false,
    ...overrides,
  };
}

export function makeSkill(
  overrides: Partial<SkillAuthorshipRow> = {},
): SkillAuthorshipRow {
  return {
    skillName: 'tests.skill.md',
    usedByOthersCount: 0,
    ...overrides,
  };
}

export function makeMember(
  overrides: Partial<MemberRawRows> = {},
): MemberRawRows {
  return {
    meta: { memberId: 'm-1', workingDays: 20 },
    prs: [makePr()],
    sessions: [makeSession()],
    deploys: [makeDeploy()],
    skills: [makeSkill()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A strong, fully-signalled single member (passes every dimension's min-signal).
// 6 merged AI PRs, 12 sessions, AI deploys, authored+reused skill.
// ---------------------------------------------------------------------------
export function strongMember(memberId = 'strong'): MemberRawRows {
  const prs: PrRow[] = Array.from({ length: 6 }, (_, i) =>
    makePr({
      prId: `${memberId}-pr-${i}`,
      files: 2 + i,
      hunks: 3 + i,
      aiLinesMerged: 100,
      aiLinesAliveAt30d: 95,
    }),
  );
  const sessions: SessionRow[] = Array.from({ length: 12 }, (_, i) =>
    makeSession({
      sessionId: `${memberId}-s-${i}`,
      linkedPrId: `${memberId}-pr-${i % 6}`,
      day: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      turns: 3,
      suggestionsOffered: 10,
      suggestionsAccepted: 8,
    }),
  );
  return {
    meta: { memberId, workingDays: 20 },
    prs,
    sessions,
    deploys: [
      makeDeploy({ deployId: `${memberId}-d-0` }),
      makeDeploy({ deployId: `${memberId}-d-1` }),
    ],
    skills: [
      makeSkill({ skillName: `${memberId}-a.skill.md`, usedByOthersCount: 2 }),
      makeSkill({ skillName: `${memberId}-b.skill.md`, usedByOthersCount: 1 }),
    ],
  };
}

/** A weak member: high tokens, low retention, frequent reverts, no skills. */
export function weakMember(memberId = 'weak'): MemberRawRows {
  const prs: PrRow[] = Array.from({ length: 6 }, (_, i) =>
    makePr({
      prId: `${memberId}-pr-${i}`,
      files: 1,
      hunks: 1,
      aiLinesMerged: 100,
      aiLinesAliveAt30d: 20,
      revertedWithin14d: i < 3, // half reverted
      defectReworkWithin14d: i < 2,
      agenticMajority: false,
    }),
  );
  const sessions: SessionRow[] = Array.from({ length: 12 }, (_, i) =>
    makeSession({
      sessionId: `${memberId}-s-${i}`,
      linkedPrId: `${memberId}-pr-${i % 6}`,
      day: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      turns: 11, // many iterations
      tokensIn: 60000,
      tokensOut: 30000, // high token burn
      cacheRead: 1000,
      suggestionsOffered: 10,
      suggestionsAccepted: 2, // low acceptance
      skillsUsed: [],
    }),
  );
  return {
    meta: { memberId, workingDays: 20 },
    prs,
    sessions,
    deploys: [makeDeploy({ deployId: `${memberId}-d-0`, changeFailed: true })],
    skills: [],
  };
}

/** A median member between strong and weak. */
export function midMember(memberId = 'mid'): MemberRawRows {
  const prs: PrRow[] = Array.from({ length: 6 }, (_, i) =>
    makePr({
      prId: `${memberId}-pr-${i}`,
      files: 3,
      hunks: 4,
      aiLinesMerged: 100,
      aiLinesAliveAt30d: 60,
      revertedWithin14d: i < 1,
    }),
  );
  const sessions: SessionRow[] = Array.from({ length: 12 }, (_, i) =>
    makeSession({
      sessionId: `${memberId}-s-${i}`,
      linkedPrId: `${memberId}-pr-${i % 6}`,
      day: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      turns: 6,
      tokensIn: 20000,
      tokensOut: 8000,
      suggestionsOffered: 10,
      suggestionsAccepted: 6,
    }),
  );
  return {
    meta: { memberId, workingDays: 20 },
    prs,
    sessions,
    deploys: [makeDeploy({ deployId: `${memberId}-d-0` })],
    skills: [makeSkill({ skillName: `${memberId}-a.skill.md`, usedByOthersCount: 1 })],
  };
}

/** An empty member: no evidence at all (drives Insufficient + suppressed L1). */
export function emptyMember(memberId = 'empty'): MemberRawRows {
  return {
    meta: { memberId, workingDays: 20 },
    prs: [],
    sessions: [],
    deploys: [],
    skills: [],
  };
}

/**
 * The canonical N=3 multi-member cohort: weak / mid / strong. Used by aggregate
 * tests to assert median-over-N and outlier robustness.
 */
export function threeMemberCohort(): MemberRawRows[] {
  return [weakMember(), midMember(), strongMember()];
}

/** Trailing-90-day sizing PRs: a spread so tertiles are meaningful. */
export function sizingPrs(): PrRow[] {
  return [
    makePr({ prId: 'sz-1', files: 1, hunks: 1, modules: 1, blast: 0 }), // score 4
    makePr({ prId: 'sz-2', files: 2, hunks: 2, modules: 1, blast: 0 }), // 6
    makePr({ prId: 'sz-3', files: 3, hunks: 4, modules: 1, blast: 0 }), // 9
    makePr({ prId: 'sz-4', files: 5, hunks: 6, modules: 2, blast: 0 }), // 15
    makePr({ prId: 'sz-5', files: 8, hunks: 10, modules: 3, blast: 1 }), // 27
    makePr({ prId: 'sz-6', files: 12, hunks: 14, modules: 4, blast: 1 }), // 37
  ];
}
