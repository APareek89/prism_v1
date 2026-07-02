// lib/recommendations/rules/course-nudge.ts
//
// COURSE rec — "take a micro-course on your weakest dimension".
//
// Grounding: reads the persisted employee-scope L2 dimension scores (index_daily, written
// by the scoring engine). We pick the LOWEST-scoring dimension that has a real signal
// (non-null) and is below the improvement threshold, and nudge a course for it. The course
// `ref` is the dimension slug — the courses track (lib/courses, not ours) resolves it to a
// concrete studio course. before = weakest L2, after = the threshold, delta = the gap.
//
// Deterministic tie-break: canonical dimension order (usage < efficiency < effectiveness <
// proficiency) breaks ties so the same inputs always pick the same dimension.

import type { Dimension } from '@/lib/scoring/types';
import type { Rule } from '../types';
import { COURSE } from '../thresholds';

/** L2 below this (and lowest) makes the dimension a course candidate. */
const WEAK_THRESHOLD = COURSE.weakThreshold;

/** Canonical order — also the deterministic tie-break order. */
const ORDER: readonly Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];

export const courseNudgeRule: Rule = (ctx) => {
  let weakest: { dim: Dimension; score: number } | null = null;
  for (const dim of ORDER) {
    const score = ctx.l2[dim];
    if (score === null || score === undefined) continue; // no signal → not a candidate
    if (score >= WEAK_THRESHOLD) continue;
    // strictly-less keeps the FIRST (canonical-order) dimension on a tie → deterministic.
    if (weakest === null || score < weakest.score) weakest = { dim, score };
  }
  if (weakest === null) return null;

  const delta = Number((WEAK_THRESHOLD - weakest.score).toFixed(1));
  return {
    kind: 'course',
    ref: weakest.dim, // the courses track resolves this dimension slug to a studio course
    rationale:
      `Your ${label(weakest.dim)} score is ${Math.round(weakest.score)} — your weakest ` +
      `dimension. A short course targeting ${label(weakest.dim)} is the fastest lift.`,
    detectedVia: 'course-nudge',
    dimension: weakest.dim,
    evidence: {
      metric: `l2_${weakest.dim}`,
      before: Number(weakest.score.toFixed(1)),
      after: WEAK_THRESHOLD,
      delta,
      unit: 'score',
      signals: 1,
    },
  };
};

function label(dim: Dimension): string {
  switch (dim) {
    case 'usage':
      return 'Usage / AI-depth';
    case 'efficiency':
      return 'Efficiency';
    case 'effectiveness':
      return 'Effectiveness';
    case 'proficiency':
      return 'Proficiency';
  }
}
