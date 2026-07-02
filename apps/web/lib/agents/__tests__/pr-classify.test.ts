// lib/agents/__tests__/pr-classify.test.ts
//
// The PR verdict is decided in CODE (determinism boundary). These tests pin the
// classifier's precedence and edge cases so the LLM can never influence the class.

import { describe, it, expect } from 'vitest';
import { classifyPr, REPROMPT_ITERATION_THRESHOLD } from '../nodes/pr-classify';
import {
  PR_CLEAN,
  PR_REVERT,
  PR_SELF_REVERT,
  PR_SLOP,
  PR_REPROMPT,
} from './fixtures';

describe('classifyPr', () => {
  it('classifies a healthy merged PR as clean', () => {
    expect(classifyPr(PR_CLEAN)).toBe('clean');
  });

  it('classifies a reverted-within-14d merge as revert', () => {
    expect(classifyPr(PR_REVERT)).toBe('revert');
  });

  it('does NOT classify a self-revert as revert (anti-gaming)', () => {
    // author caught it themselves → excluded from the revert verdict
    expect(classifyPr(PR_SELF_REVERT)).toBe('clean');
  });

  it('classifies an AI-majority change with rework as ai_slop', () => {
    expect(classifyPr(PR_SLOP)).toBe('ai_slop');
  });

  it('classifies a high-iteration merge as re_prompt', () => {
    expect(classifyPr(PR_REPROMPT)).toBe('re_prompt');
  });

  it('applies the iteration threshold at the exact boundary', () => {
    const below = { ...PR_CLEAN, aiIterations: REPROMPT_ITERATION_THRESHOLD - 1 };
    const at = { ...PR_CLEAN, aiIterations: REPROMPT_ITERATION_THRESHOLD };
    expect(classifyPr(below)).toBe('clean');
    expect(classifyPr(at)).toBe('re_prompt');
  });

  it('prefers revert over slop and re_prompt (severity precedence)', () => {
    const worst = {
      ...PR_CLEAN,
      revertedWithin14d: true,
      agenticMajority: true,
      defectReworkWithin14d: true,
      aiIterations: 20,
    };
    expect(classifyPr(worst)).toBe('revert');
  });

  it('prefers slop over re_prompt when both apply', () => {
    const both = {
      ...PR_CLEAN,
      agenticMajority: true,
      defectReworkWithin14d: true,
      aiIterations: 20,
    };
    expect(classifyPr(both)).toBe('ai_slop');
  });

  it('is total — always returns a verdict', () => {
    const unmerged = { ...PR_CLEAN, isMerged: false, revertedWithin14d: true };
    // an unmerged PR is not a delivered outcome → clean (the revert guard requires merged)
    expect(classifyPr(unmerged)).toBe('clean');
  });

  it('is a pure function of its inputs (deterministic)', () => {
    const a = classifyPr(PR_SLOP);
    const b = classifyPr(PR_SLOP);
    expect(a).toBe(b);
  });
});
