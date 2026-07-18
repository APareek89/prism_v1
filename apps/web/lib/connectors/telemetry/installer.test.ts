import { describe, expect, it } from 'vitest';
import { buildTelemetryInstaller } from './installer';

describe('buildTelemetryInstaller', () => {
  it('creates a user-level Codex OTLP/JSON setup with prompts off and backups on', () => {
    const script = buildTelemetryInstaller('codex', 'prsm_test_token', 'http://localhost:3000');
    expect(script).toContain('$CONFIG_FILE.prism-backup-');
    expect(script).toContain('log_user_prompt = false');
    expect(script).toContain('protocol = \\"json\\"');
    expect(script).toContain('/api/connect/telemetry/otel/v1/logs');
    expect(script).toContain('PRISM_CODEX_CONFIG_DIR');
    expect(script).toContain('/api/connect/telemetry/pr-link');
    expect(script).toContain('hooks.json');
    expect(script).toContain('PRISM_PROVIDER=codex');
    expect(script).toContain('prism-pr-link-forwarder.mjs');
    expect(script).toContain('open /hooks');
  });

  it('merges Claude Code telemetry environment settings without enabling prompt logs', () => {
    const script = buildTelemetryInstaller('claude_code', 'prsm_test_token', 'http://localhost:3000');
    expect(script).toContain('$CONFIG_FILE.prism-backup-');
    expect(script).toContain('CLAUDE_CODE_ENABLE_TELEMETRY');
    expect(script).toContain('OTEL_LOG_USER_PROMPTS');
    expect(script).toContain('"0"');
    expect(script).toContain('http/json');
    expect(script).toContain('PRISM_CLAUDE_CONFIG_DIR');
    expect(script).toContain('/api/connect/telemetry/pr-link');
    expect(script).toContain('PostToolUse');
    expect(script).toContain('PRISM_PROVIDER=claude_code');
    expect(script).toContain('prism-pr-link-forwarder.mjs');
  });

  it('keeps the hook request metadata-only', () => {
    const script = buildTelemetryInstaller('codex', 'prsm_test_token', 'https://prism.example');
    expect(script).toContain('sessionId: sessionId.trim()');
    expect(script).toContain('repo: match[1]');
    expect(script).toContain('prNumber: Number(match[2])');
    expect(script).not.toContain('body: raw');
  });
});
