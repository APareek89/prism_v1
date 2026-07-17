// lib/connectors/sentry/index.ts
//
// SentryConnector — the optional Effectiveness/F3 (change-failure + MTTR) source.
// Entry point: `ingestSentry(functionId)`.
//
// GRACEFUL DEGRADATION CONTRACT (landmine: SENTRY_* ship blank):
//   • Not configured  → status('sentry') === 'not_configured'; connect()/ingest()
//     write NOTHING and NEVER throw. F3 simply has no signal and the index degrades.
//   • Configured but Sentry errors → status row flips to 'error' with last_error set;
//     still no throw to the caller (the pipeline keeps going for other connectors).
//
// What it writes (raw evidence only — no scores, no buckets):
//   • public.deploys   ← Sentry releases (one per release sha)
//   • public.incidents ← Sentry issues (MTTR start/end + severity)
//   • deploys.change_failed flipped true for any deploy an incident attributes to.
//
// Columns are validated against migration 0009 (authoritative) + the live DB.

import { createAdminClient } from '@/lib/supabase/admin';
import { appTable } from '@/lib/supabase/server';
import { isConfigured } from '@/lib/config/env';
import type { ConnectorStatus } from '@/lib/types/db';
import type { IngestResult } from '@/lib/types/connectors';
import { createSentryClient, type SentryClient } from './client';
import { mapReleasesToDeploys, type DeployInsert } from './releases';
import { mapIssuesToIncidents, resolveIncidentDeploys } from './incidents';

/** The connector's public surface. status() is keyless-safe and never touches Sentry. */
export interface SentryConnectorApi {
  status(): ConnectorStatus;
  /** Persist/refresh the connectors row. */
  connect(functionId: string): Promise<void>;
  /** Pull releases + issues and write deploys/incidents. Returns a tally. */
  ingest(functionId: string): Promise<IngestResult>;
}

const CONNECTOR_TYPE = 'sentry' as const;

// ---------------------------------------------------------------------------
// Local loose query surface. `appTable()` (lib/supabase/server.ts) is intentionally
// minimal and does NOT expose `.in()`; we add it here for the deploys read-back +
// change_failed update WITHOUT touching the shared escape hatch. Casting is the same
// pattern the M1 read layer uses while the generated Database type stays a placeholder.
// ---------------------------------------------------------------------------
type DbResult = Promise<{ data: unknown; error: unknown }>;
interface LooseChain extends DbResult {
  eq: (col: string, val: unknown) => LooseChain;
  in: (col: string, vals: readonly unknown[]) => LooseChain;
  select: (cols: string) => LooseChain;
  insert: (rows: unknown) => LooseChain;
  update: (patch: unknown) => LooseChain;
  upsert: (rows: unknown, opts?: unknown) => LooseChain;
}
interface LooseDb {
  from: (table: string) => LooseChain;
}
/** Cast the admin client to the `.in()`-aware loose surface. */
function looseDb(): LooseDb {
  return createAdminClient() as unknown as LooseDb;
}

class SentryConnector implements SentryConnectorApi {
  /** Synchronous, env-only — never hits the network or DB. */
  status(): ConnectorStatus {
    return isConfigured('sentry') ? 'connected' : 'not_configured';
  }

  async connect(functionId: string): Promise<void> {
    if (!isConfigured('sentry')) {
      // Keyless-safe: record that the connector exists but is unconfigured. No employee,
      // no evidence. Never throws.
      await upsertConnectorRow(functionId, 'not_configured', null);
      return;
    }
    await upsertConnectorRow(functionId, 'connected', null);
  }

  async ingest(functionId: string): Promise<IngestResult> {
    const result: IngestResult = { type: CONNECTOR_TYPE, written: 0, skipped: 0, errors: [] };

    const client = createSentryClient();
    if (!client) {
      // Not configured → write nothing, degrade gracefully.
      await upsertConnectorRow(functionId, 'not_configured', null);
      return result;
    }

    await upsertConnectorRow(functionId, 'syncing', null);
    try {
      const written = await ingestFromSentry(client, functionId, result);
      result.written = written;
      await upsertConnectorRow(functionId, 'connected', null, new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(message);
      // Surface the failure as connector health — but do NOT throw past ingest so the
      // rest of the pipeline (and other connectors) keep running.
      await upsertConnectorRow(functionId, 'error', message);
    }
    return result;
  }
}

/** The single shared instance. */
export const sentryConnector: SentryConnectorApi = new SentryConnector();

/**
 * ENTRY POINT. Pull Sentry releases + issues for `functionId` and persist deploys /
 * incidents. Keyless-safe and non-throwing: an unconfigured or failing Sentry only
 * affects connector health + the F3 signal, never the caller.
 */
export async function ingestSentry(functionId: string): Promise<IngestResult> {
  return sentryConnector.ingest(functionId);
}

// ---------------------------------------------------------------------------
// Core ingest (configured path)
// ---------------------------------------------------------------------------

async function ingestFromSentry(
  client: SentryClient,
  functionId: string,
  result: IngestResult,
): Promise<number> {
  const db = looseDb();

  // 1) Releases → deploys. The project slug is the repo fallback when a release has
  //    no VCS ref attached.
  const releases = await client.listReleases();
  const deployInserts = mapReleasesToDeploys(releases, functionId, client.project);
  result.skipped += releases.length - deployInserts.length;

  let writtenDeploys = 0;
  if (deployInserts.length > 0) {
    const { error } = await db
      .from('deploys')
      .upsert(deployInserts, { onConflict: 'repo,sha,env' });
    if (error) throw asError('deploys upsert', error);
    writtenDeploys = deployInserts.length;
  }

  // 2) Build sha → deploy_id from the persisted rows (needed to tie incidents to
  //    deploys and to flip change_failed).
  const shaToDeployId = await loadShaToDeployId(db, functionId, deployInserts);

  // 3) Issues → incidents. We pull both resolved + unresolved so MTTR can close out.
  //    A resolved+unresolved query keeps the signal complete.
  const issues = await client.listIssues('is:unresolved, is:resolved');
  const incidentInserts = mapIssuesToIncidents(issues, functionId);
  result.skipped += issues.length - incidentInserts.length;

  const { rows: incidentRows, failedDeployIds } = resolveIncidentDeploys(
    incidentInserts,
    shaToDeployId,
  );

  let writtenIncidents = 0;
  if (incidentRows.length > 0) {
    const { error } = await db.from('incidents').insert(incidentRows);
    if (error) throw asError('incidents insert', error);
    writtenIncidents = incidentRows.length;
  }

  // 4) Flip change_failed on every deploy an incident attributes to.
  if (failedDeployIds.length > 0) {
    const { error } = await db
      .from('deploys')
      .update({ change_failed: true })
      .in('id', failedDeployIds);
    if (error) throw asError('deploys change_failed update', error);
  }

  return writtenDeploys + writtenIncidents;
}

/** Read back deploy ids for the shas we just upserted, so incidents can resolve their
 *  deploy_id. Scoped to this function. */
async function loadShaToDeployId(
  db: LooseDb,
  functionId: string,
  deployInserts: DeployInsert[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (deployInserts.length === 0) return map;

  const shas = [...new Set(deployInserts.map((d) => d.sha))];
  const { data, error } = (await db
    .from('deploys')
    .select('id, sha')
    .eq('function_id', functionId)
    .in('sha', shas)) as { data: Array<{ id: string; sha: string }> | null; error: unknown };
  if (error) throw asError('deploys read-back', error);
  for (const row of data ?? []) map.set(row.sha, row.id);
  return map;
}

// ---------------------------------------------------------------------------
// Connector-row bookkeeping
// ---------------------------------------------------------------------------

/** Upsert the per-function connectors row (UNIQUE(function_id, type)). Never throws
 *  on a not-configured path; a write error here is non-fatal connector bookkeeping. */
async function upsertConnectorRow(
  functionId: string,
  status: ConnectorStatus,
  lastError: string | null,
  lastSyncAt?: string,
): Promise<void> {
  try {
    const db = appTable(createAdminClient());
    const row: Record<string, unknown> = {
      function_id: functionId,
      type: CONNECTOR_TYPE,
      status,
      config_jsonb: {},
      last_error: lastError,
    };
    if (lastSyncAt) row.last_sync_at = lastSyncAt;
    await db.from('connectors').upsert(row, { onConflict: 'function_id,type' });
  } catch {
    // Bookkeeping must never break the keyless-boot / degrade-gracefully contract.
  }
}

function asError(context: string, error: unknown): Error {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null
        ? JSON.stringify(error)
        : String(error);
  return new Error(`Sentry connector: ${context} — ${detail}`);
}

// ───────────────────────────────────────────────────────────────────────────
// OPTIONAL FALLBACK (NOT wired into ingest — documented, clearly flagged).
//
// When Sentry releases are ABSENT (no SENTRY_* config, or a project with no releases),
// deploy signal can be approximated from default-branch merges already in gh_prs: each
// merged PR onto the default branch is treated as one deploy. This keeps F3's
// denominator non-zero without a Sentry connection.
//
// We deliberately DO NOT call this from ingest(): it would manufacture deploy rows the
// moment GitHub is connected, conflating "merged" with "deployed" and double-counting
// against real Sentry releases. Enable it explicitly (e.g. from the pipeline, only when
// the Sentry connector is not_configured) if/when the product wants the approximation.
//
// Mapping (if you wire it): gh_prs.merge_sha → deploys.sha, gh_prs.repo → deploys.repo,
// env='production', ts=merged_at, status='merged', change_failed=false (incidents.ts
// still flips it), ai_assisted=gh_prs.ai_assisted. Upsert onConflict 'repo,sha,env'.
// ───────────────────────────────────────────────────────────────────────────

/** @deprecated-intent OPTIONAL — see the comment block above. Not called by ingest(). */
export async function deploysFromDefaultBranchMergesFallback(
  functionId: string,
): Promise<IngestResult> {
  const result: IngestResult = { type: CONNECTOR_TYPE, written: 0, skipped: 0, errors: [] };
  try {
    const db = appTable(createAdminClient());
    const { data, error } = (await db
      .from('gh_prs')
      .select('repo, merge_sha, merged_at, ai_assisted')
      .eq('function_id', functionId)
      .eq('is_merged', true)) as {
      data: Array<{
        repo: string;
        merge_sha: string | null;
        merged_at: string | null;
        ai_assisted: boolean | null;
      }> | null;
      error: unknown;
    };
    if (error) throw asError('gh_prs read for fallback', error);

    const seen = new Set<string>();
    const inserts: DeployInsert[] = [];
    for (const pr of data ?? []) {
      if (!pr.merge_sha) {
        result.skipped += 1;
        continue;
      }
      const key = `${pr.repo} ${pr.merge_sha} production`;
      if (seen.has(key)) continue;
      seen.add(key);
      inserts.push({
        function_id: functionId,
        repo: pr.repo,
        sha: pr.merge_sha,
        env: 'production',
        ts: pr.merged_at,
        status: 'merged',
        change_failed: false,
        ai_assisted: Boolean(pr.ai_assisted),
      });
    }

    if (inserts.length > 0) {
      const { error: upErr } = await db
        .from('deploys')
        .upsert(inserts, { onConflict: 'repo,sha,env' });
      if (upErr) throw asError('fallback deploys upsert', upErr);
      result.written = inserts.length;
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }
  return result;
}
