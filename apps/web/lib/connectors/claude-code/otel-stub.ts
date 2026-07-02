// lib/connectors/claude-code/otel-stub.ts
//
// Typed NO-OP OpenTelemetry ingest for Claude Code. The OTEL path (org-wide
// telemetry export → an OTLP collector → cc_sessions w/ account_uuid set) is a
// future, multi-employee onboarding surface. In M2 there is no collector wired and
// OTEL_LOG_USER_PROMPTS stays OFF (we never ingest prompt text via OTEL). This stub
// keeps the connector's shape OTEL-ready while writing nothing and never throwing.

/** The result of an OTEL ingest attempt. Always 'not_configured' in M2. */
export interface OtelIngestResult {
  status: 'not_configured';
  /** rows written — always 0 for the stub. */
  written: number;
  /** whether prompt logging is enabled (always false; privacy default). */
  promptLoggingEnabled: false;
  note: string;
}

/** Whether the OTEL collector is configured. Always false in M2 (no env wired). */
export function isOtelConfigured(): boolean {
  return false;
}

/**
 * No-op OTEL ingest. Returns a typed 'not_configured' result and writes nothing.
 * Safe to call unconditionally — the connector can advertise an OTEL path without
 * any collector present. OTEL_LOG_USER_PROMPTS is intentionally NOT read/honored
 * here: prompt text is never ingested via OTEL in this build.
 */
export async function ingestOtel(): Promise<OtelIngestResult> {
  return {
    status: 'not_configured',
    written: 0,
    promptLoggingEnabled: false,
    note: 'OTEL collector not configured; Claude Code telemetry uses the local-file path. OTEL_LOG_USER_PROMPTS stays off.',
  };
}
