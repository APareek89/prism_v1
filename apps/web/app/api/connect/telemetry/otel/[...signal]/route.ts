import { normalizeOtelLogs } from '@/lib/connectors/telemetry/normalize';
import {
  authenticateTelemetryToken,
  persistTelemetryEvents,
  touchTelemetryConnection,
} from '@/lib/connectors/telemetry/store';

export const dynamic = 'force-dynamic';

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
} as const;
const MAX_BODY_BYTES = 2_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function tokenFrom(req: Request): string | null {
  const direct = req.headers.get('x-prism-token')?.trim();
  if (direct) return direct;
  const authorization = req.headers.get('authorization')?.trim() ?? '';
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null;
}

export async function POST(req: Request): Promise<Response> {
  const token = tokenFrom(req);
  if (!token) return json({ error: 'missing collector token' }, 401);

  const connection = await authenticateTelemetryToken(token);
  if (!connection) return json({ error: 'invalid or revoked collector token' }, 401);

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'OTLP payload too large' }, 413);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
    return json({ error: 'MVP collector accepts OTLP/HTTP JSON only' }, 415);
  }

  let payload: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return json({ error: 'OTLP payload too large' }, 413);
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'invalid OTLP JSON' }, 400);
  }

  if ((payload as { prism_test?: unknown })?.prism_test === true) {
    await touchTelemetryConnection(connection.id);
    return json({ ok: true, connected: true });
  }

  const path = new URL(req.url).pathname;
  if (!path.endsWith('/v1/logs')) {
    // Metrics/traces prove the connection is alive, but the MVP only normalizes logs.
    await touchTelemetryConnection(connection.id);
    return json({});
  }

  const events = normalizeOtelLogs(payload);
  const result = await persistTelemetryEvents(connection, events);
  return json({ partialSuccess: { rejectedLogRecords: 0 }, prism: result });
}

