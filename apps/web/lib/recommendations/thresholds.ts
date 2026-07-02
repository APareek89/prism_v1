// lib/recommendations/thresholds.ts
//
// The single source of truth for every numeric threshold a rule fires on. The rules read
// these to DECIDE, and the adoption predicates read the SAME values to RE-VERIFY, so a rec
// can never be "adopted" against a looser bar than it was raised on. Where a threshold
// mirrors the scoring engine's frozen anchor (index-config.default.ts) the comment says so.

/** skill-reuse: min sessions before the reuse signal is trustworthy, and the reuse-share floor. */
export const SKILL_REUSE = { minSessions: 3, floor: 0.34 } as const;

/** skill-author: min merged AI PRs before an authorship nudge makes sense. */
export const SKILL_AUTHOR = { minAiPrs: 2 } as const;

/** size-discipline: min merged PRs + the large-PR-share ceiling. */
export const SIZE_DISCIPLINE = { minMerged: 4, lShareCeil: 0.4 } as const;

/** acceptance-rate: floor — mirrors the scoring engine's cold-start suggestion_acceptance_rate floor. */
export const ACCEPTANCE = { floor: 0.4 } as const;

/** cache-efficiency: min input-token volume + the cache-read-share floor. */
export const CACHE = { minInputTokens: 50_000, floor: 0.5 } as const;

/** revert-rate: floor — mirrors the scoring engine's cold-start merged_without_revert_rate floor. */
export const REVERT = { floor: 0.8 } as const;

/** course-nudge: L2 below this (and lowest) makes a dimension a course candidate. */
export const COURSE = { weakThreshold: 55 } as const;
