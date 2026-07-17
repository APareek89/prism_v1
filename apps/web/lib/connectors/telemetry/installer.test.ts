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
  });

  it('merges Claude Code telemetry environment settings without enabling prompt logs', () => {
    const script = buildTelemetryInstaller('claude_code', 'prsm_test_token', 'http://localhost:3000');
    expect(script).toContain('$CONFIG_FILE.prism-backup-');
    expect(script).toContain('CLAUDE_CODE_ENABLE_TELEMETRY');
    expect(script).toContain('OTEL_LOG_USER_PROMPTS');
    expect(script).toContain('"0"');
    expect(script).toContain('http/json');
    expect(script).toContain('PRISM_CLAUDE_CONFIG_DIR');
  });
});
