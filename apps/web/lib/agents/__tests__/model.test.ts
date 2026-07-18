import { afterEach, describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => ({ fields: null as Record<string, unknown> | null }));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class {
    constructor(fields: Record<string, unknown>) {
      constructed.fields = fields;
    }
  },
}));

describe('Anthropic model request compatibility', () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    const { __resetModels } = await import('../model');
    __resetModels();
    constructed.fields = null;
  });

  it('omits the legacy top_p=-1 sentinel for current model ids', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const { narrator } = await import('../model');

    await narrator();

    expect(constructed.fields).toMatchObject({
      temperature: 0,
      maxTokens: 4096,
      invocationKwargs: { top_p: undefined },
      clientOptions: { timeout: 45_000, maxRetries: 0 },
    });
  });
});
