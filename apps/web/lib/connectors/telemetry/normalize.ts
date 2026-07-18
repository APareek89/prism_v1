import type { NormalizedTelemetryEvent } from './types';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function otelValue(value: unknown): unknown {
  const v = object(value);
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return v.intValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('boolValue' in v) return v.boolValue;
  if ('string_value' in v) return v.string_value;
  if ('int_value' in v) return v.int_value;
  if ('double_value' in v) return v.double_value;
  if ('bool_value' in v) return v.bool_value;
  return null;
}

function attributes(value: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of list(value)) {
    const row = object(entry);
    const key = typeof row.key === 'string' ? row.key : null;
    if (key) out[key] = otelValue(row.value);
  }
  return out;
}

function firstString(attrs: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function numeric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(Math.round(parsed), Number.MAX_SAFE_INTEGER);
}

function firstNumber(attrs: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    if (attrs[key] !== undefined && attrs[key] !== null) return numeric(attrs[key]);
  }
  return 0;
}

function firstBoolean(attrs: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return null;
}

function timestamp(record: JsonObject): string {
  const candidates = [
    record.timeUnixNano,
    record.time_unix_nano,
    record.observedTimeUnixNano,
    record.observed_time_unix_nano,
  ];

  for (const raw of candidates) {
    try {
      const nanos = typeof raw === 'bigint'
        ? raw
        : typeof raw === 'string' && /^\d+$/.test(raw)
          ? BigInt(raw)
          : typeof raw === 'number' && Number.isSafeInteger(raw)
            ? BigInt(raw)
            : 0n;
      // Codex currently emits timeUnixNano="0" for some OTLP logs. Zero is an
      // absent provider timestamp, not 1970 evidence, so continue to the observed
      // timestamp before falling back to the collector receive time.
      if (nanos <= 0n) continue;
      const parsed = new Date(Number(nanos / 1_000_000n));
      if (Number.isNaN(parsed.getTime())) continue;
      return parsed.toISOString();
    } catch {
      // Try the next provider timestamp before using a safe receive timestamp.
    }
  }
  return new Date().toISOString();
}

function bodyName(record: JsonObject): string | null {
  const decoded = otelValue(record.body);
  if (typeof decoded !== 'string') return null;
  const candidate = decoded.trim();
  // OTLP log bodies are free-form. Only accept the documented provider event-name
  // shape; arbitrary bodies may contain prompt/tool/output content and are discarded.
  return /^(codex|claude_code)\.[a-z0-9_.-]+$/i.test(candidate) ? candidate : null;
}

/**
 * Reduce OTLP/HTTP JSON logs to the metadata Prism needs. The body and all unknown
 * attributes are discarded immediately, which prevents prompt/code/tool payloads from
 * crossing the persistence boundary even when a provider emits them.
 */
export function normalizeOtelLogs(payload: unknown): NormalizedTelemetryEvent[] {
  const root = object(payload);
  const resources = list(root.resourceLogs ?? root.resource_logs);
  const events: NormalizedTelemetryEvent[] = [];

  for (const resourceEntry of resources) {
    const resourceLog = object(resourceEntry);
    const resourceAttrs = attributes(object(resourceLog.resource).attributes);
    const scopes = list(resourceLog.scopeLogs ?? resourceLog.scope_logs);

    for (const scopeEntry of scopes) {
      const scopeLog = object(scopeEntry);
      const scopeAttrs = attributes(object(scopeLog.scope).attributes);
      const records = list(scopeLog.logRecords ?? scopeLog.log_records);

      for (const recordEntry of records) {
        const record = object(recordEntry);
        const attrs = {
          ...resourceAttrs,
          ...scopeAttrs,
          ...attributes(record.attributes),
        };

        const namedEvent = firstString(attrs, ['event.name', 'event_name']);
        const eventName = (
          namedEvent && /^(codex|claude_code)\.[a-z0-9_.-]+$/i.test(namedEvent)
            ? namedEvent
            : bodyName(record) ?? 'otel.log'
        ).slice(0, 200);
        const sourceSessionId = firstString(attrs, [
          'conversation.id',
          'conversation_id',
          'session.id',
          'session_id',
          'claude_code.session.id',
        ]);
        const promptChars = firstNumber(attrs, [
          'prompt.length',
          'prompt_length',
          'prompt.char_count',
          'prompt_chars',
          'input.length',
        ]);

        events.push({
          sourceSessionId: sourceSessionId?.slice(0, 300) ?? null,
          eventName,
          eventTime: timestamp(record),
          model: firstString(attrs, [
            'model',
            'model_name',
            'gen_ai.request.model',
            'gen_ai.response.model',
          ])?.slice(0, 200) ?? null,
          tokensIn: firstNumber(attrs, [
            'input_tokens',
            'input.token_count',
            'gen_ai.usage.input_tokens',
            'gen_ai.usage.prompt_tokens',
          ]),
          tokensOut: firstNumber(attrs, [
            'output_tokens',
            'output.token_count',
            'gen_ai.usage.output_tokens',
            'gen_ai.usage.completion_tokens',
          ]),
          cacheRead: firstNumber(attrs, [
            'cache_read_tokens',
            'cache_read_input_tokens',
            'gen_ai.usage.cache_read_tokens',
          ]),
          cacheCreation: firstNumber(attrs, [
            'cache_creation_tokens',
            'cache_creation_input_tokens',
            'gen_ai.usage.cache_creation_tokens',
          ]),
          promptChars: promptChars > 0 ? promptChars : null,
          success: firstBoolean(attrs, ['success', 'request.success', 'tool.success']),
        });
      }
    }
  }

  return events;
}
