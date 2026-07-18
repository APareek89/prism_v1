import { parsePrLinkEvidence } from '@/lib/connectors/pr-link/parse';
import {
  persistPrLinkEvidence,
  resolveScopedInstallation,
  verifyGithubPr,
} from '@/lib/connectors/pr-link/store';
import { authenticateTelemetryToken, touchTelemetryConnection } from '@/lib/connectors/telemetry/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 16_384;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
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
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'PR-link payload too large' }, 413);
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
    return json({ error: 'content-type must be application/json' }, 415);
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return json({ error: 'PR-link payload too large' }, 413);
    }
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const parsed = parsePrLinkEvidence(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  try {
    const installationId = await resolveScopedInstallation(connection, parsed.value.repo);
    if (!installationId) {
      return json({ ok: true, stored: false, reason: 'repository is outside this connection scope' }, 202);
    }

    const verified = await verifyGithubPr({
      installationId,
      repo: parsed.value.repo,
      prNumber: parsed.value.prNumber,
    });
    if (verified === 'not_found') {
      return json({ ok: true, stored: false, reason: 'pull request not found' }, 202);
    }

    const stored = await persistPrLinkEvidence(connection, parsed.value);
    await touchTelemetryConnection(connection.id);
    return json({
      ok: true,
      stored: true,
      inserted: stored.inserted,
      evidenceId: stored.id,
      provider: connection.provider,
      pr: { repo: parsed.value.repo, number: parsed.value.prNumber },
    });
  } catch (error) {
    return json({
      error: 'PR-link verification or persistence failed',
      detail: error instanceof Error ? error.message : 'unknown error',
    }, 503);
  }
}
