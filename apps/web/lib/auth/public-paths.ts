const PUBLIC_PATHS = [
  '/auth/sign-in',
  '/auth/callback',
  '/api/auth/magic-link',
  '/api/health',
  // These endpoints authenticate with a short-lived invite or collector bearer
  // token. Requiring a browser session would turn their shell/OTLP responses into
  // an HTML sign-in redirect.
  '/api/connect/telemetry/install',
  '/api/connect/telemetry/otel',
  '/api/connect/telemetry/pr-link',
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
