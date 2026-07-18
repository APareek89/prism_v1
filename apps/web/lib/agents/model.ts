// lib/agents/model.ts
//
// LAZY model access for the agent nodes. KEYLESS-SAFE (hard rule): a ChatAnthropic
// client is NEVER constructed at import — only on first `narrator()`/`classifier()`
// call, and only when `shouldUseRealModel()` is true (ANTHROPIC configured AND not
// DEMO_MODE). When keyless / demo, callers fall back to the mock model
// (mock-model.ts) so the whole graph runs without ever touching the network.
//
// The narrator is Sonnet (temp 0 for determinism-of-phrasing); the classifier is
// Haiku. Nodes get structured output via `structured(model, schema)` which wraps
// withStructuredOutput so every LLM emission is a validated narrative shape.

import type { ChatAnthropic } from '@langchain/anthropic';
import type { z } from 'zod';
import { serverEnv, isConfigured } from '@/lib/config/env';
import { isDemoMode } from '@/lib/config/flags';
import { narrativeModel, classifierModel } from '@/lib/config/models';

// ---------------------------------------------------------------------------
// Real-model gate
// ---------------------------------------------------------------------------

/**
 * True only when we should call the real Anthropic API: the key is present AND we are
 * not in DEMO_MODE. DEMO_MODE forces the mock path so a demo run is deterministic,
 * offline, and $0 (spec: "a DEMO/mock model path lets graphs run without calling
 * Anthropic"). Never throws.
 */
export function shouldUseRealModel(): boolean {
  try {
    return isConfigured('anthropic') && !isDemoMode();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lazy client construction (memoized per model id)
// ---------------------------------------------------------------------------

let _narrator: ChatAnthropic | null = null;
let _classifier: ChatAnthropic | null = null;

/** Dynamically import ChatAnthropic so the module is never pulled in at build/import. */
async function makeClient(model: string, temperature: number): Promise<ChatAnthropic> {
  const { ChatAnthropic } = await import('@langchain/anthropic');
  // requireServerEnv-style read: the key is present (shouldUseRealModel gated this).
  const apiKey = serverEnv.ANTHROPIC_API_KEY as string;
  return new ChatAnthropic({
    apiKey,
    model,
    temperature,
    maxTokens: 4096,
    maxRetries: 1,
    clientOptions: { timeout: 45_000, maxRetries: 0 },
    // @langchain/anthropic 0.3.x defaults unknown/new model ids to topP=-1.
    // Anthropic's current Messages API rejects that sentinel. An explicit
    // undefined override keeps top_p out of the serialized request while leaving
    // temperature=0 as Prism's only sampling control.
    invocationKwargs: { top_p: undefined },
  });
}

/** The narrative model (Sonnet, temp 0). Lazily constructed; caller must gate on shouldUseRealModel(). */
export async function narrator(): Promise<ChatAnthropic> {
  if (_narrator) return _narrator;
  _narrator = await makeClient(narrativeModel(), 0);
  return _narrator;
}

/** The classifier model (Haiku, temp 0). Used only for optional tie-breaks. */
export async function classifier(): Promise<ChatAnthropic> {
  if (_classifier) return _classifier;
  _classifier = await makeClient(classifierModel(), 0);
  return _classifier;
}

// ---------------------------------------------------------------------------
// Structured-output helper
// ---------------------------------------------------------------------------

/** A minimal structured-output caller: takes a system+user prompt, returns the parsed shape. */
export interface StructuredRunner<T> {
  invoke(system: string, user: string): Promise<T>;
}

/**
 * Wrap a lazily-obtained ChatAnthropic in a schema-bound runner. The schema enforces
 * the narrative-only contract (schemas.ts) — the model can only return those fields.
 */
export function structured<T extends z.ZodTypeAny>(
  getModel: () => Promise<ChatAnthropic>,
  schema: T,
  schemaName: string,
): StructuredRunner<z.infer<T>> {
  return {
    async invoke(system: string, user: string): Promise<z.infer<T>> {
      const model = await getModel();
      const bound = model.withStructuredOutput(schema, { name: schemaName });
      return (await bound.invoke([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ])) as z.infer<T>;
    },
  };
}

/** Reset memoized clients (tests / config change). */
export function __resetModels(): void {
  _narrator = null;
  _classifier = null;
}
