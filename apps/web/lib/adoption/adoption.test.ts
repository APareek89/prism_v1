// lib/adoption/adoption.test.ts
//
// Pure-logic verification for the adoption state machine + re-verify predicates.

import { describe, it, expect } from 'vitest';
import type { RuleContext, KpiPoint, PrFact, SessionFact, CourseFact } from '@/lib/recommendations/types';
import { nextStatus, isTransition, isTerminal, type RecStatus } from './transitions';
import { verifyRec } from './predicates';

function kpi(raw: number | null): KpiPoint {
  return { kpiId: 'x', raw, norm: raw === null ? null : 50, confidence: 'medium' };
}
function pr(over: Partial<PrFact> = {}): PrFact {
  return { id: crypto.randomUUID(), isMerged: true, sizeBucket: 'M', aiAssisted: false, reverted: false, ...over };
}
function session(over: Partial<SessionFact> = {}): SessionFact {
  return { id: crypto.randomUUID(), turns: 5, tokensIn: 1000, cacheRead: 0, skillsUsed: [], linkedPrId: null, ...over };
}
function course(over: Partial<CourseFact> = {}): CourseFact {
  return { courseId: 'c', dimension: null, knowledgeCheckPassed: false, ...over };
}
function ctx(over: Partial<RuleContext> = {}): RuleContext {
  return {
    functionId: 'fn', employeeId: 'emp', date: '2026-07-01',
    kpis: {}, l2: { usage: null, efficiency: null, effectiveness: null, proficiency: null },
    prs: [], sessions: [], authoredSkills: [], courses: [], ...over,
  };
}

describe('transitions state machine', () => {
  it('adopts from any open state on an adopted signal', () => {
    for (const s of ['suggested', 'acknowledged', 'in_progress'] as RecStatus[]) {
      expect(nextStatus(s, 'adopted')).toBe('adopted');
    }
  });
  it('dismisses from any open state on a stale signal', () => {
    for (const s of ['suggested', 'acknowledged', 'in_progress'] as RecStatus[]) {
      expect(nextStatus(s, 'stale')).toBe('dismissed');
    }
  });
  it('never auto-acknowledges a suggested rec (human step) on active/none', () => {
    expect(nextStatus('suggested', 'active')).toBe('suggested');
    expect(nextStatus('suggested', 'none')).toBe('suggested');
  });
  it('advances acknowledged → in_progress on active', () => {
    expect(nextStatus('acknowledged', 'active')).toBe('in_progress');
    expect(nextStatus('acknowledged', 'none')).toBe('acknowledged');
  });
  it('leaves terminal states untouched', () => {
    expect(nextStatus('adopted', 'stale')).toBe('adopted');
    expect(nextStatus('dismissed', 'adopted')).toBe('dismissed');
    expect(isTerminal('adopted')).toBe(true);
    expect(isTerminal('dismissed')).toBe(true);
  });
  it('isTransition flags real changes only', () => {
    expect(isTransition('suggested', 'suggested')).toBe(false);
    expect(isTransition('acknowledged', 'in_progress')).toBe(true);
  });
});

describe('verifyRec predicates', () => {
  it('skill-author: adopted once a skill is authored, stale when AI activity vanishes', () => {
    expect(verifyRec('skill-author', 'author-first-skill', ctx({ authoredSkills: ['s'] })).signal).toBe('adopted');
    expect(verifyRec('skill-author', 'author-first-skill', ctx({ prs: [] })).signal).toBe('stale');
    expect(verifyRec('skill-author', 'author-first-skill', ctx({ prs: [pr({ aiAssisted: true }), pr({ aiAssisted: true })] })).signal).toBe('none');
  });
  it('skill-reuse: adopted ≥floor, active if some reuse below floor, stale if volume drops', () => {
    const above = [session({ skillsUsed: ['a'] }), session({ skillsUsed: ['b'] }), session()];
    expect(verifyRec('skill-reuse', 'skill-reuse', ctx({ sessions: above })).signal).toBe('adopted');
    const some = [session({ skillsUsed: ['a'] }), session(), session(), session()];
    expect(verifyRec('skill-reuse', 'skill-reuse', ctx({ sessions: some })).signal).toBe('active');
    const none = [session(), session(), session(), session()];
    expect(verifyRec('skill-reuse', 'skill-reuse', ctx({ sessions: none })).signal).toBe('none');
    expect(verifyRec('skill-reuse', 'skill-reuse', ctx({ sessions: [session()] })).signal).toBe('stale');
  });
  it('acceptance-rate: adopted at/above floor, stale on lost signal', () => {
    expect(verifyRec('acceptance-rate', 'prompting-technique', ctx({ kpis: { suggestion_acceptance_rate: kpi(0.5) } })).signal).toBe('adopted');
    expect(verifyRec('acceptance-rate', 'prompting-technique', ctx({ kpis: { suggestion_acceptance_rate: kpi(0.2) } })).signal).toBe('none');
    expect(verifyRec('acceptance-rate', 'prompting-technique', ctx()).signal).toBe('stale');
  });
  it('size-discipline: adopted at/below ceiling', () => {
    const good = [pr({ sizeBucket: 'S' }), pr({ sizeBucket: 'S' }), pr({ sizeBucket: 'M' }), pr({ sizeBucket: 'L' })];
    expect(verifyRec('size-discipline', 'size-discipline', ctx({ prs: good })).signal).toBe('adopted');
  });
  it('cache-efficiency: adopted at/above floor', () => {
    expect(verifyRec('cache-efficiency', 'cache-efficiency', ctx({ sessions: [session({ cacheRead: 60_000, tokensIn: 40_000 })] })).signal).toBe('adopted');
  });
  it('revert-rate: adopted at/above floor', () => {
    expect(verifyRec('revert-rate', 'verify-before-merge', ctx({ kpis: { merged_without_revert_rate: kpi(0.9) } })).signal).toBe('adopted');
  });
  it('course-nudge: adopted on passed knowledge check or recovered L2', () => {
    expect(verifyRec('course-nudge', 'effectiveness', ctx({ courses: [course({ dimension: 'effectiveness', knowledgeCheckPassed: true })] })).signal).toBe('adopted');
    expect(verifyRec('course-nudge', 'effectiveness', ctx({ l2: { usage: null, efficiency: null, effectiveness: 60, proficiency: null } })).signal).toBe('adopted');
    expect(verifyRec('course-nudge', 'effectiveness', ctx({ l2: { usage: null, efficiency: null, effectiveness: 30, proficiency: null } })).signal).toBe('none');
  });
  it('unknown detected_via never auto-transitions', () => {
    expect(verifyRec('mystery', 'x', ctx()).signal).toBe('none');
  });
});
