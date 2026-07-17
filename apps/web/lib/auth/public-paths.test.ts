import { describe, expect, it } from 'vitest';
import { isPublicPath } from './public-paths';

describe('isPublicPath', () => {
  it('allows token-authenticated installer and OTLP endpoints without a browser session', () => {
    expect(isPublicPath('/api/connect/telemetry/install/claude_code')).toBe(true);
    expect(isPublicPath('/api/connect/telemetry/install/codex')).toBe(true);
    expect(isPublicPath('/api/connect/telemetry/otel/v1/logs')).toBe(true);
    expect(isPublicPath('/api/connect/telemetry/otel/v1/traces')).toBe(true);
  });

  it('keeps browser-session telemetry management endpoints protected', () => {
    expect(isPublicPath('/api/connect/telemetry/self')).toBe(false);
    expect(isPublicPath('/api/connect/telemetry/invites')).toBe(false);
    expect(isPublicPath('/api/connect/telemetry/connections')).toBe(false);
    expect(isPublicPath('/api/connect/telemetry/installations')).toBe(false);
  });
});
