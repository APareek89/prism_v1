// lib/config/models.ts
//
// LLM model/provider configuration. Pure constants + lazy env reads — no client is
// ever constructed here (the Anthropic client lives lazily in lib/agents/model.ts).
// The defaults match the spec; env can override per deployment.

import { serverEnv } from './env';

/** Narrative agent model — writes prose only, never numbers (architecture §0.3). */
export const NARRATIVE_MODEL = 'claude-sonnet-4-6' as const;

/** Cheap classifier model — PR classification / tie-breaks only. */
export const CLASSIFIER_MODEL = 'claude-haiku-4-5' as const;

export type LlmProvider = 'anthropic';

/** Resolve the configured provider. Only 'anthropic' is supported in the MVP, so any
 *  value maps to it (the switch exists for forward-compatibility). */
export function llmProvider(): LlmProvider {
  // Reference the env so the value is read lazily; anthropic is the only target today.
  void serverEnv.LLM_PROVIDER;
  return 'anthropic';
}

/** The narrative model id, env-overridable. */
export function narrativeModel(): string {
  return serverEnv.ANTHROPIC_MODEL || NARRATIVE_MODEL;
}

/** The classifier model id, env-overridable. */
export function classifierModel(): string {
  return serverEnv.ANTHROPIC_CLASSIFIER_MODEL || CLASSIFIER_MODEL;
}

export const LLM_PROVIDER = {
  get value(): LlmProvider {
    return llmProvider();
  },
};
