import { describe, it, expect } from 'vitest';
import {
  effectiveSkillLeverage,
  distinctSkillsAuthored,
  multiplierSignal,
} from './proficiency';
import { makeMember, makePr, makeSession, makeSkill } from '../__fixtures__/rows';

describe('proficiency.effectiveSkillLeverage', () => {
  it('is (skill-PR retention) − (non-skill-PR retention)', () => {
    const m = makeMember({
      prs: [
        // skill PR: high retention
        makePr({ prId: 'skill', aiLinesMerged: 100, aiLinesAliveAt30d: 90 }),
        // non-skill PR: lower retention
        makePr({ prId: 'plain', aiLinesMerged: 100, aiLinesAliveAt30d: 60 }),
      ],
      sessions: [
        makeSession({
          sessionId: 's1',
          linkedPrId: 'skill',
          producedOutput: true,
          skillsUsed: ['tests.skill.md'],
        }),
        makeSession({
          sessionId: 's2',
          linkedPrId: 'plain',
          producedOutput: true,
          skillsUsed: [],
        }),
      ],
    });
    // 0.90 − 0.60 = 0.30
    expect(effectiveSkillLeverage(m).value).toBeCloseTo(0.3, 6);
  });

  it('voids skill credit when the session produced no output (anti-gaming)', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'a', aiLinesMerged: 100, aiLinesAliveAt30d: 90 }),
        makePr({ prId: 'b', aiLinesMerged: 100, aiLinesAliveAt30d: 50 }),
      ],
      sessions: [
        // skill used but NO output → does not count as a skill PR
        makeSession({
          sessionId: 's1',
          linkedPrId: 'a',
          producedOutput: false,
          skillsUsed: ['x.skill.md'],
        }),
        makeSession({
          sessionId: 's2',
          linkedPrId: 'b',
          producedOutput: true,
          skillsUsed: [],
        }),
      ],
    });
    // Both PRs land on the non-skill side → no skill cohort → null edge.
    expect(effectiveSkillLeverage(m).value).toBeNull();
  });

  it('is null when only one side has data (cannot compute an edge)', () => {
    const m = makeMember({
      prs: [makePr({ prId: 'a', aiLinesMerged: 100, aiLinesAliveAt30d: 90 })],
      sessions: [
        makeSession({
          sessionId: 's1',
          linkedPrId: 'a',
          producedOutput: true,
          skillsUsed: ['x.skill.md'],
        }),
      ],
    });
    expect(effectiveSkillLeverage(m).value).toBeNull();
  });
});

describe('proficiency.distinctSkillsAuthored', () => {
  it('counts distinct authored skill files', () => {
    const m = makeMember({
      skills: [
        makeSkill({ skillName: 'a.skill.md' }),
        makeSkill({ skillName: 'a.skill.md' }), // duplicate
        makeSkill({ skillName: 'b.skill.md' }),
      ],
    });
    expect(distinctSkillsAuthored(m).value).toBe(2);
  });
  it('is 0 (not null) when none authored — a real measured zero', () => {
    const m = makeMember({ skills: [] });
    expect(distinctSkillsAuthored(m).value).toBe(0);
  });
});

describe('proficiency.multiplierSignal', () => {
  it('counts authored skills reused by ≥1 other engineer', () => {
    const m = makeMember({
      skills: [
        makeSkill({ skillName: 'a.skill.md', usedByOthersCount: 2 }),
        makeSkill({ skillName: 'b.skill.md', usedByOthersCount: 0 }),
      ],
    });
    expect(multiplierSignal(m).value).toBe(1);
  });
  it('is 0 when no authored skill is reused', () => {
    const m = makeMember({ skills: [makeSkill({ usedByOthersCount: 0 })] });
    expect(multiplierSignal(m).value).toBe(0);
  });
});
