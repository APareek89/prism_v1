import { describe, expect, it } from 'vitest';
import { normalizeOtelLogs } from './normalize';

function attr(key: string, value: string | number | boolean) {
  const encoded = typeof value === 'boolean'
    ? { boolValue: value }
    : typeof value === 'number'
      ? { intValue: String(value) }
      : { stringValue: value };
  return { key, value: encoded };
}

describe('normalizeOtelLogs', () => {
  it('keeps scoring metadata and discards content-bearing attributes', () => {
    const [event] = normalizeOtelLogs({
      resourceLogs: [{
        resource: { attributes: [attr('service.name', 'codex')] },
        scopeLogs: [{
          scope: { attributes: [] },
          logRecords: [{
            timeUnixNano: '1760000000000000000',
            body: { stringValue: 'codex.user_prompt' },
            attributes: [
              attr('conversation.id', 'conversation-1'),
              attr('model', 'gpt-test'),
              attr('prompt_length', 144),
              attr('input_tokens', 50),
              attr('output_tokens', 20),
              attr('prompt', 'must never cross the boundary'),
              attr('tool.output', 'must never cross the boundary'),
            ],
          }],
        }],
      }],
    });

    expect(event).toEqual({
      sourceSessionId: 'conversation-1',
      eventName: 'codex.user_prompt',
      eventTime: '2025-10-09T08:53:20.000Z',
      model: 'gpt-test',
      tokensIn: 50,
      tokensOut: 20,
      cacheRead: 0,
      cacheCreation: 0,
      promptChars: 144,
      success: null,
    });
    expect(JSON.stringify(event)).not.toContain('must never');
  });

  it('does not treat arbitrary OTLP bodies as event names', () => {
    const [event] = normalizeOtelLogs({
      resourceLogs: [{ scopeLogs: [{ logRecords: [{ body: { stringValue: 'private response text' } }] }] }],
    });
    expect(event?.eventName).toBe('otel.log');
    expect(JSON.stringify(event)).not.toContain('private response text');
  });

  it('captures Codex response.completed counters without double-counting cached input', () => {
    const [event] = normalizeOtelLogs({
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            body: { stringValue: 'codex.sse_event' },
            attributes: [
              attr('conversation.id', 'conversation-2'),
              attr('event.kind', 'response.completed'),
              attr('slug', 'gpt-5.6-sol'),
              attr('input_token_count', 10_701),
              attr('output_token_count', 122),
              attr('cached_token_count', 8_192),
            ],
          }],
        }],
      }],
    });

    expect(event).toMatchObject({
      sourceSessionId: 'conversation-2',
      eventName: 'codex.sse_event',
      model: 'gpt-5.6-sol',
      tokensIn: 2_509,
      tokensOut: 122,
      cacheRead: 8_192,
    });
    expect((event?.tokensIn ?? 0) + (event?.tokensOut ?? 0) + (event?.cacheRead ?? 0)).toBe(10_823);
  });

  it('treats a zero provider timestamp as absent and uses the observed timestamp', () => {
    const [event] = normalizeOtelLogs({
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: '0',
            observedTimeUnixNano: '1760000000000000000',
            body: { stringValue: 'codex.tool_result' },
          }],
        }],
      }],
    });

    expect(event?.eventTime).toBe('2025-10-09T08:53:20.000Z');
  });

  it('uses collector receive time when all provider timestamps are absent', () => {
    const before = Date.now();
    const [event] = normalizeOtelLogs({
      resourceLogs: [{
        scopeLogs: [{ logRecords: [{ timeUnixNano: '0', observedTimeUnixNano: '0' }] }],
      }],
    });
    const after = Date.now();

    const eventTime = Date.parse(event?.eventTime ?? '');
    expect(eventTime).toBeGreaterThanOrEqual(before);
    expect(eventTime).toBeLessThanOrEqual(after);
  });
});
