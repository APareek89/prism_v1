import { describe, it, expect } from 'vitest';
import {
  dropExcludedSessions,
  isLabelSpam,
  creditedSkills,
  applyAntiGaming,
} from './anti-gaming';
import { makeMember, makePr, makeSession } from './__fixtures__/rows';

describe('anti-gaming.dropExcludedSessions', () => {
  it('removes BYO/unmatched/missing-stream sessions', () => {
    const sessions = [
      makeSession({ sessionId: 'ok', excludedFromAiRates: false }),
      makeSession({ sessionId: 'byo', excludedFromAiRates: true }),
    ];
    const kept = dropExcludedSessions(sessions);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.sessionId).toBe('ok');
  });
});

describe('anti-gaming.isLabelSpam', () => {
  it('flags a merged PR with no feature label', () => {
    expect(isLabelSpam(makePr({ isMerged: true, hasFeatureLabel: false }))).toBe(true);
  });
  it('does not flag a labelled merged PR', () => {
    expect(isLabelSpam(makePr({ isMerged: true, hasFeatureLabel: true }))).toBe(false);
  });
  it('does not flag an un-merged PR', () => {
    expect(isLabelSpam(makePr({ isMerged: false, hasFeatureLabel: false }))).toBe(false);
  });
});

describe('anti-gaming.creditedSkills (skill-credit requires output)', () => {
  it('credits skills only when the session produced output', () => {
    expect(
      creditedSkills(makeSession({ producedOutput: true, skillsUsed: ['a.skill.md'] })),
    ).toEqual(['a.skill.md']);
  });
  it('voids skill credit when no output was produced', () => {
    expect(
      creditedSkills(makeSession({ producedOutput: false, skillsUsed: ['a.skill.md'] })),
    ).toEqual([]);
  });
});

describe('anti-gaming.applyAntiGaming', () => {
  it('drops excluded sessions, strips label-spam agentic credit, voids output-less skills', () => {
    const m = makeMember({
      prs: [
        makePr({ prId: 'good', isMerged: true, hasFeatureLabel: true, agenticMajority: true }),
        makePr({ prId: 'spam', isMerged: true, hasFeatureLabel: false, agenticMajority: true }),
      ],
      sessions: [
        makeSession({ sessionId: 'ok', excludedFromAiRates: false, producedOutput: true, skillsUsed: ['x.skill.md'] }),
        makeSession({ sessionId: 'byo', excludedFromAiRates: true }),
        makeSession({ sessionId: 'noout', producedOutput: false, skillsUsed: ['y.skill.md'] }),
      ],
    });
    const cleaned = applyAntiGaming(m);

    // BYO session dropped.
    expect(cleaned.sessions.map((s) => s.sessionId)).toEqual(['ok', 'noout']);
    // label-spam PR lost its agentic credit; the good PR kept it.
    const spam = cleaned.prs.find((p) => p.prId === 'spam')!;
    const good = cleaned.prs.find((p) => p.prId === 'good')!;
    expect(spam.agenticMajority).toBe(false);
    expect(good.agenticMajority).toBe(true);
    // output-less session's skills voided.
    const noout = cleaned.sessions.find((s) => s.sessionId === 'noout')!;
    expect(noout.skillsUsed).toEqual([]);
  });

  it('does not mutate the input (pure)', () => {
    const m = makeMember({
      sessions: [makeSession({ sessionId: 'byo', excludedFromAiRates: true })],
    });
    const before = m.sessions.length;
    applyAntiGaming(m);
    expect(m.sessions).toHaveLength(before);
  });
});
