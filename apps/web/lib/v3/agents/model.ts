// lib/v3/agents/model.ts
//
// Lazy, keyless-safe model access for the v3 coaching agent. Uses the Anthropic
// SDK directly with TOOL-FORCED structured output (the installed LangChain
// wrapper sends a top_p default current Claude models reject). The zod schema
// still validates every emission — schema-invalid output throws and the caller's
// repair/drop policy applies.
//
// DECISION (2026-07-02): unlike the parked v1 agents, DEMO_MODE does NOT force
// the mock here — the agent narration IS the demo. Gate = key presence only:
// key set → real Anthropic (temp 0); no key → deterministic mock (keyless boot).

import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';

export function agentUsesRealModel(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.length > 0;
}

export function agentModelId(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

let _client: Anthropic | null = null;

async function client(): Promise<Anthropic> {
  if (_client) return _client;
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  _client = new AnthropicSdk({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/**
 * Tool-forced structured call: the model MUST answer by "calling" a tool whose
 * input_schema is the artifact shape; we then zod-validate the tool input.
 */
export async function invokeStructured<T extends z.ZodTypeAny>(
  schema: T,
  jsonSchema: Record<string, unknown>,
  name: string,
  system: string,
  user: string,
): Promise<z.infer<T>> {
  const c = await client();
  const res = await c.messages.create({
    model: agentModelId(),
    max_tokens: 1600,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [{ name, description: `Return the ${name} result.`, input_schema: jsonSchema as never }],
    tool_choice: { type: 'tool', name },
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error(`model returned no ${name} tool call`);
  const parsed = schema.safeParse(block.input);
  if (!parsed.success) throw new Error(`schema-invalid ${name}: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data as z.infer<T>;
}

export function __resetAgentModel(): void {
  _client = null;
}
