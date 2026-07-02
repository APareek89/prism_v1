// lib/agents/prompts/labels.ts
//
// Human labels for the four dimensions, used by prompt templates and the mock model.
// Kept in its own tiny module (NOT imported from lib/db/_base, which pulls next/headers
// and is server-request-only) so the agent layer stays free of RSC-only imports and is
// safe to unit-test.

import type { Dimension } from '@/lib/scoring/types';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  usage: 'Usage / AI-depth',
  efficiency: 'Efficiency',
  effectiveness: 'Effectiveness',
  proficiency: 'Proficiency',
};
