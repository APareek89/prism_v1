// lib/agents/schemas.ts
//
// The zod contracts the LLM nodes emit via withStructuredOutput. HARD RULE
// (determinism boundary, architecture §0.3): these shapes contain NARRATIVE fields
// (title/body/reason/fix) and `evidenceRefs` ONLY. There is NO numeric field —
// est_impact, rankings, deltas, and verdict CLASS are all computed in code and never
// requested from the model. `evidenceRefs` are ids the grounding gate validates
// against the deterministic evidence set.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared field: evidenceRefs
// ---------------------------------------------------------------------------

/** ids into the provided evidence set. The grounding gate rejects any that dangle. */
const evidenceRefs = z
  .array(z.string())
  .describe(
    'The exact evidence ids (from the EVIDENCE list you were given) that support this ' +
      'statement. Only cite ids that appear in that list. Do not invent ids.',
  );

// ---------------------------------------------------------------------------
// improvement-area — one "Top-to-improve" narrative (rank + est_impact in code)
// ---------------------------------------------------------------------------

export const ImprovementItemSchema = z.object({
  title: z
    .string()
    .describe('A short imperative headline for the improvement (no numbers). ≤ 70 chars.'),
  body: z
    .string()
    .describe(
      'One or two grounded sentences explaining what to do and why, citing only the ' +
        'metrics present in the provided inputs. Do not state any number that is not in ' +
        'the inputs.',
    ),
  evidenceRefs,
});
export type ImprovementItem = z.infer<typeof ImprovementItemSchema>;

export const ImprovementAreaSchema = z.object({
  items: z
    .array(ImprovementItemSchema)
    .describe('The ranked improvement areas, most impactful first. May be empty.'),
});
export type ImprovementAreaOutput = z.infer<typeof ImprovementAreaSchema>;

// ---------------------------------------------------------------------------
// change-governance — "what moved the index" narrative (direction + amount in code)
// ---------------------------------------------------------------------------

export const DriverItemSchema = z.object({
  title: z.string().describe('A short headline naming what changed (no numbers). ≤ 70 chars.'),
  body: z
    .string()
    .describe('One grounded sentence on why it moved, citing only provided metrics.'),
  evidenceRefs,
});
export type DriverItem = z.infer<typeof DriverItemSchema>;

export const ChangeGovernanceSchema = z.object({
  drivers: z
    .array(DriverItemSchema)
    .describe('The narrative for each computed driver, in the order given. May be empty.'),
});
export type ChangeGovernanceOutput = z.infer<typeof ChangeGovernanceSchema>;

// ---------------------------------------------------------------------------
// improvement-attribution — "what's going well — and why"
// ---------------------------------------------------------------------------

export const AttributionItemSchema = z.object({
  title: z.string().describe('A short headline for the strength (no numbers). ≤ 70 chars.'),
  body: z
    .string()
    .describe('One grounded sentence attributing the win to a cause, citing provided metrics.'),
  evidenceRefs,
});
export type AttributionItem = z.infer<typeof AttributionItemSchema>;

export const ImprovementAttributionSchema = z.object({
  items: z
    .array(AttributionItemSchema)
    .describe('The "going well" attributions, strongest first. May be empty.'),
});
export type ImprovementAttributionOutput = z.infer<typeof ImprovementAttributionSchema>;

// ---------------------------------------------------------------------------
// pr-level — reason + fix ONLY (the verdict class is decided in code)
// ---------------------------------------------------------------------------

export const PrLevelNarrativeSchema = z.object({
  reason: z
    .string()
    .describe(
      'One grounded sentence on why this PR earned its (already-decided) verdict, citing ' +
        'only the signals provided for this PR. Do not restate the verdict word as a claim ' +
        'about a number.',
    ),
  fix: z
    .string()
    .describe('One short, concrete next-step suggestion for the author. No numbers.'),
  evidenceRefs,
});
export type PrLevelNarrative = z.infer<typeof PrLevelNarrativeSchema>;
