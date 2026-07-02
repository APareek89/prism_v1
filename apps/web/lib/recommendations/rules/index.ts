// lib/recommendations/rules/index.ts
//
// The ordered rule registry. Order is the rec-precedence order (skills first, then process
// nudges, then the course fallback) and is DETERMINISTIC — the engine runs rules in this
// exact order so a given input always yields the same rec set. Each rule's id is the
// `detected_via` it stamps, and is also the adoption re-verify key.

import type { RegisteredRule } from '../types';
import { skillAuthorRule } from './skill-author';
import { skillReuseRule } from './skill-reuse';
import { acceptanceRateRule } from './acceptance-rate';
import { sizeDisciplineRule } from './size-discipline';
import { cacheEfficiencyRule } from './cache-efficiency';
import { revertRateRule } from './revert-rate';
import { courseNudgeRule } from './course-nudge';

/** All rules in precedence order. */
export const ALL_RULES: readonly RegisteredRule[] = [
  { id: 'skill-author', run: skillAuthorRule },
  { id: 'skill-reuse', run: skillReuseRule },
  { id: 'acceptance-rate', run: acceptanceRateRule },
  { id: 'size-discipline', run: sizeDisciplineRule },
  { id: 'cache-efficiency', run: cacheEfficiencyRule },
  { id: 'revert-rate', run: revertRateRule },
  { id: 'course-nudge', run: courseNudgeRule },
] as const;

export {
  skillAuthorRule,
  skillReuseRule,
  acceptanceRateRule,
  sizeDisciplineRule,
  cacheEfficiencyRule,
  revertRateRule,
  courseNudgeRule,
};
