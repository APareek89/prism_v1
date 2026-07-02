// app/api/connectors/status/route.ts
//
// GET /api/connectors/status → per-connector health for the Admin cards.
// Reads the `connectors` table (migration 0006) for the bootstrap function and returns
// one entry per known connector type (github / claude_code / sentry), so the Admin grid
// can refresh after a connect/scan without a full page reload.
//
// Admin-gated. Keyless-safe: when Supabase isn't configured (or the table is empty)
// every connector reports 'not_configured'. Never throws.

import { withAdmin } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { appTable } from '@/lib/supabase/server';
import { isConfigured } from '@/lib/config/env';
import type { ConnectorStatus, ConnectorType } from '@/lib/types/db';
import { ok, resolveBootstrapFunctionId, errMessage } from '../_lib/route-helpers';

export const dynamic = 'force-dynamic';

/** The three connector types the Admin grid renders, in display order. */
const CONNECTOR_TYPES: ConnectorType[] = ['github', 'claude_code', 'sentry'];

/** Whether the env for a given connector type is present (configured probe). */
function configuredFor(type: ConnectorType): boolean {
  switch (type) {
    case 'github':
      return isConfigured('github');
    case 'claude_code':
      return isConfigured('claudeCode');
    case 'sentry':
      return isConfigured('sentry');
    default:
      return false;
  }
}

interface ConnectorHealthDTO {
  type: ConnectorType;
  status: ConnectorStatus;
  connected: boolean;
  configured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

interface ConnectorRow {
  type: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
}

export const GET = withAdmin(async (): Promise<Response> => {
  const functionId = await resolveBootstrapFunctionId();

  // Default: every connector not_configured (with its env-probe configured flag).
  const base: Record<ConnectorType, ConnectorHealthDTO> = {
    github: emptyHealth('github'),
    claude_code: emptyHealth('claude_code'),
    sentry: emptyHealth('sentry'),
  };

  if (functionId && isConfigured('supabase')) {
    try {
      const db = appTable(createAdminClient());
      const { data } = await db
        .from('connectors')
        .select('type, status, last_sync_at, last_error')
        .eq('function_id', functionId);
      const rows = (Array.isArray(data) ? data : []) as ConnectorRow[];
      for (const row of rows) {
        const t = row.type as ConnectorType;
        if (!(t in base)) continue;
        const status = (row.status as ConnectorStatus) ?? 'not_configured';
        base[t] = {
          type: t,
          status,
          connected: status === 'connected',
          configured: configuredFor(t),
          lastSyncAt: row.last_sync_at ?? null,
          lastError: row.last_error ?? null,
        };
      }
    } catch (e) {
      // Degrade to defaults; surface the read error but never throw.
      return ok({ ok: true, functionId, connectors: CONNECTOR_TYPES.map((t) => base[t]), warning: errMessage(e) });
    }
  }

  return ok({ ok: true, functionId, connectors: CONNECTOR_TYPES.map((t) => base[t]) });
});

function emptyHealth(type: ConnectorType): ConnectorHealthDTO {
  return {
    type,
    status: 'not_configured',
    connected: false,
    configured: configuredFor(type),
    lastSyncAt: null,
    lastError: null,
  };
}
