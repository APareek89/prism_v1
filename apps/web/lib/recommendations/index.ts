// lib/recommendations/index.ts
//
// Public surface for the deterministic recommendations engine (M4 · A2).
// The durable daily pipeline calls deriveAndStoreRecommendations(functionId, date).

export { deriveAndStoreRecommendations, runRules } from './engine';
export type { DeriveResult } from './engine';
export { loadContext } from './store';
export { ALL_RULES } from './rules';
export type {
  RuleContext,
  RuleOutput,
  RecEvidence,
  Rule,
  RegisteredRule,
  RecKind,
} from './types';
