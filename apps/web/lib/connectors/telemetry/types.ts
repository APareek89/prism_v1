export const TELEMETRY_PROVIDERS = ['codex', 'claude_code'] as const;

export type TelemetryProvider = (typeof TELEMETRY_PROVIDERS)[number];

export interface TelemetryConnectionIdentity {
  id: string;
  functionId: string;
  employeeId: string;
  provider: TelemetryProvider;
}

export interface NormalizedTelemetryEvent {
  sourceSessionId: string | null;
  eventName: string;
  eventTime: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheCreation: number;
  promptChars: number | null;
  success: boolean | null;
}

export function isTelemetryProvider(value: unknown): value is TelemetryProvider {
  return TELEMETRY_PROVIDERS.includes(value as TelemetryProvider);
}

