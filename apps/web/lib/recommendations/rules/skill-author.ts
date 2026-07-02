// lib/recommendations/rules/skill-author.ts
//
// SKILL rec — "author your first reusable skill".
//
// Grounding: the proficiency dimension rewards distinct authored skills. A member with
// real AI activity (merged AI-assisted PRs in the window) but ZERO authored skills is the
// prime candidate. before = distinct_skills_authored raw (0), after = 1 (author one),
// delta = 1. We only fire when there is genuine AI PR activity to build a skill from — a
// member with no shipped AI work gets a different (usage) nudge, not this.

import type { Rule } from '../types';
import { SKILL_AUTHOR } from '../thresholds';

const MIN_AI_PRS = SKILL_AUTHOR.minAiPrs;

export const skillAuthorRule: Rule = (ctx) => {
  if (ctx.authoredSkills.length > 0) return null; // already authoring

  const aiPrs = ctx.prs.filter((p) => p.isMerged && p.aiAssisted).length;
  if (aiPrs < MIN_AI_PRS) return null; // not enough shipped AI work to distill a skill

  return {
    kind: 'skill',
    ref: 'author-first-skill',
    rationale:
      `You shipped ${aiPrs} AI-assisted PRs this window but have authored no reusable ` +
      `skill yet. Distil one recurring prompt into a skill file — authored skills lift ` +
      `your proficiency score and, when reused, the whole squad's.`,
    detectedVia: 'skill-author',
    dimension: 'proficiency',
    evidence: {
      metric: 'distinct_skills_authored',
      before: 0,
      after: 1,
      delta: 1,
      unit: 'count',
      signals: aiPrs,
    },
  };
};
