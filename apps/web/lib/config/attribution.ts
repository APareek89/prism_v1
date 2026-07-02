// lib/config/attribution.ts
//
// Per-employee attribution-mode resolution. Decouples *identity* (whose employee
// row a session/PR maps to) from *whether it counts toward AI rates* (architecture
// §0.6, PRD §7.2.1). A 'byo' or 'unmatched' employee is still a real person in the
// roster, but their Claude-Code stream is excluded from AI-rate denominators and
// drops confidence.

import type { AttributionMode } from '@/lib/types/attribution-mode';

export type { AttributionMode };

/** Human labels for the Admin attribution selector. */
export const ATTRIBUTION_LABELS: Record<AttributionMode, string> = {
  matched: 'Matched',
  unmatched: 'Unmatched',
  byo: 'Bring-your-own key',
};

/** Short explanatory copy for the Admin badge tooltip. */
export const ATTRIBUTION_DESCRIPTIONS: Record<AttributionMode, string> = {
  matched: 'Claude Code stream is linked to this employee — counts toward AI rates.',
  unmatched: 'No linked Claude Code stream — excluded from AI rates, lowers confidence.',
  byo: 'Employee uses their own API key — excluded from AI rates, lowers confidence.',
};

/** Whether an employee's signal counts toward AI-rate denominators. */
export function countsTowardAiRates(mode: AttributionMode): boolean {
  return mode === 'matched';
}

/** Whether an employee's attribution mode drops confidence (anything but matched). */
export function dropsConfidence(mode: AttributionMode): boolean {
  return mode !== 'matched';
}

/** Default mode for a freshly-provisioned employee (until Admin links a stream). */
export const DEFAULT_ATTRIBUTION_MODE: AttributionMode = 'unmatched';

/** Resolve an employee's effective mode, defaulting safely when absent. */
export function resolveAttributionMode(mode: AttributionMode | null | undefined): AttributionMode {
  return mode ?? DEFAULT_ATTRIBUTION_MODE;
}
