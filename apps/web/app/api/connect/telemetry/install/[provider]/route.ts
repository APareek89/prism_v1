import { buildTelemetryInstaller } from '@/lib/connectors/telemetry/installer';
import { consumeTelemetryInvite } from '@/lib/connectors/telemetry/store';
import { isTelemetryProvider } from '@/lib/connectors/telemetry/types';
import { publicEnv } from '@/lib/config/env';

export const dynamic = 'force-dynamic';

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  if (!isTelemetryProvider(provider)) return text('Unsupported telemetry provider.\n', 404);
  const code = req.headers.get('x-prism-invite')?.trim() ?? '';
  if (!code) return text('Missing one-time Prism invite.\n', 401);

  try {
    const consumed = await consumeTelemetryInvite(provider, code);
    if (!consumed) return text('This Prism invite is invalid, expired, or already used.\n', 410);
    return new Response(
      buildTelemetryInstaller(provider, consumed.token, new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin),
      {
        status: 200,
        headers: {
          'content-type': 'text/x-shellscript; charset=utf-8',
          'cache-control': 'no-store, max-age=0',
          'x-content-type-options': 'nosniff',
        },
      },
    );
  } catch (error) {
    return text(`Prism setup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`, 500);
  }
}
