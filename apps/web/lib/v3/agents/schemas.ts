// lib/v3/agents/schemas.ts
//
// Structured-output contracts for the v3 coaching agent. The schemas are the
// narrative-only firewall: no score/index/weight fields exist here, so the model
// literally cannot emit a number that changes anything — only prose, which the
// grounding gate then checks against the facts it was given.

import { z } from 'zod';

export const SUGGESTION_CATEGORIES = ['skill', 'verification', 'prompt', 'context', 'process'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

/** Tab-1 artifact: what is going well / what needs attention. */
export const GoodBadSchema = z.object({
  good: z
    .array(
      z.object({
        title: z.string().min(4).max(200),
        body: z.string().min(20).max(900),
        kpiRefs: z.array(z.string()).max(4).describe('KPI ids from the FACTS block this rests on'),
      }),
    )
    .min(1)
    .max(4),
  bad: z
    .array(
      z.object({
        title: z.string().min(4).max(200),
        body: z.string().min(20).max(900),
        kpiRefs: z.array(z.string()).max(4),
      }),
    )
    .min(1)
    .max(4),
});
export type GoodBad = z.infer<typeof GoodBadSchema>;

/** Growth artifact: picks from the course catalog, personally reasoned. */
export const CoursePicksSchema = z.object({
  picks: z
    .array(
      z.object({
        courseId: z.string().describe('MUST be an id from the COURSE CATALOG section'),
        reason: z.string().min(20).max(900).describe('why THIS developer, grounded in their facts'),
      }),
    )
    .min(1)
    .max(3),
});
export type CoursePicks = z.infer<typeof CoursePicksSchema>;

/** Growth artifact: concrete practice suggestions. */
export const SuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().min(4).max(200).describe('imperative, e.g. "Run the tests skill before opening a PR"'),
        body: z.string().min(20).max(900),
        category: z.enum(SUGGESTION_CATEGORIES),
        ref: z.string().optional().describe('a skill name or course id from the FACTS block, if one applies'),
        targets: z.array(z.string()).max(3).describe('KPI ids this would move'),
      }),
    )
    .min(2)
    .max(5),
});
export type Suggestions = z.infer<typeof SuggestionsSchema>;

// ── JSON Schemas for tool-forced output (mirror the zod shapes above) ─────────
const item = (props: Record<string, unknown>, required: string[]) =>
  ({ type: 'object', properties: props, required, additionalProperties: false });

export const GOOD_BAD_JSON: Record<string, unknown> = item(
  {
    good: {
      type: 'array', minItems: 1, maxItems: 4,
      items: item(
        { title: { type: 'string' }, body: { type: 'string' }, kpiRefs: { type: 'array', maxItems: 4, items: { type: 'string' } } },
        ['title', 'body', 'kpiRefs'],
      ),
    },
    bad: {
      type: 'array', minItems: 1, maxItems: 4,
      items: item(
        { title: { type: 'string' }, body: { type: 'string' }, kpiRefs: { type: 'array', maxItems: 4, items: { type: 'string' } } },
        ['title', 'body', 'kpiRefs'],
      ),
    },
  },
  ['good', 'bad'],
);

export const COURSE_PICKS_JSON: Record<string, unknown> = item(
  {
    picks: {
      type: 'array', minItems: 1, maxItems: 3,
      items: item({ courseId: { type: 'string' }, reason: { type: 'string' } }, ['courseId', 'reason']),
    },
  },
  ['picks'],
);

export const SUGGESTIONS_JSON: Record<string, unknown> = item(
  {
    suggestions: {
      type: 'array', minItems: 2, maxItems: 5,
      items: item(
        {
          title: { type: 'string' }, body: { type: 'string' },
          category: { type: 'string', enum: [...SUGGESTION_CATEGORIES] },
          ref: { type: 'string' },
          targets: { type: 'array', maxItems: 3, items: { type: 'string' } },
        },
        ['title', 'body', 'category', 'targets'],
      ),
    },
  },
  ['suggestions'],
);
