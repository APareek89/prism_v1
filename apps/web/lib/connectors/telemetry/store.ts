import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import type {
  NormalizedTelemetryEvent,
  TelemetryConnectionIdentity,
  TelemetryProvider,
} from './types';

const globalForTelemetry = globalThis as unknown as { prismTelemetryPool?: pg.Pool };

function db(): pg.Pool {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for telemetry ingest.');
  if (!globalForTelemetry.prismTelemetryPool) {
    globalForTelemetry.prismTelemetryPool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return globalForTelemetry.prismTelemetryPool;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export async function createTelemetryInvite(args: {
  functionId: string;
  employeeId: string;
  createdByEmployeeId: string | null;
  provider: TelemetryProvider;
  origin: string;
}): Promise<{ command: string; expiresAt: string }> {
  const code = `pinv_${randomBytes(24).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const client = await db().connect();
  try {
    const employee = await client.query(
      'select id from public.employees where id = $1 and function_id = $2 and active = true limit 1',
      [args.employeeId, args.functionId],
    );
    if (employee.rowCount !== 1) throw new Error('Employee is not active in this function.');
    await client.query(
      `insert into public.telemetry_invites
        (function_id, employee_id, provider, code_hash, expires_at, created_by_employee_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        args.functionId,
        args.employeeId,
        args.provider,
        hashSecret(code),
        expiresAt,
        args.createdByEmployeeId,
      ],
    );
  } finally {
    client.release();
  }

  const endpoint = new URL(`/api/connect/telemetry/install/${args.provider}`, args.origin).toString();
  const command = `curl -fsSL -X POST '${endpoint}' -H 'x-prism-invite: ${code}' | sh`;
  return { command, expiresAt };
}

export async function consumeTelemetryInvite(
  provider: TelemetryProvider,
  code: string,
): Promise<{ token: string; connection: TelemetryConnectionIdentity } | null> {
  const client = await db().connect();
  try {
    await client.query('begin');
    const invite = await client.query<{
      id: string;
      function_id: string;
      employee_id: string;
      provider: TelemetryProvider;
      expires_at: string;
      used_at: string | null;
    }>(
      `select id, function_id, employee_id, provider, expires_at, used_at
       from public.telemetry_invites
       where code_hash = $1
       for update`,
      [hashSecret(code)],
    );
    const row = invite.rows[0];
    if (!row || row.provider !== provider || row.used_at || Date.parse(row.expires_at) <= Date.now()) {
      await client.query('rollback');
      return null;
    }

    const token = `prsm_${randomBytes(32).toString('base64url')}`;
    const tokenPrefix = token.slice(0, 12);
    const connectionResult = await client.query<{
      id: string;
      function_id: string;
      employee_id: string;
      provider: TelemetryProvider;
    }>(
      `insert into public.telemetry_connections
        (function_id, employee_id, provider, token_hash, token_prefix, status, connected_at,
         last_seen_at, last_error, updated_at)
       values ($1, $2, $3, $4, $5, 'pending', null, null, null, now())
       on conflict (employee_id, provider) do update set
         function_id = excluded.function_id,
         token_hash = excluded.token_hash,
         token_prefix = excluded.token_prefix,
         status = 'pending',
         connected_at = null,
         last_seen_at = null,
         last_error = null,
         updated_at = now()
       returning id, function_id, employee_id, provider`,
      [row.function_id, row.employee_id, provider, hashSecret(token), tokenPrefix],
    );
    await client.query('update public.telemetry_invites set used_at = now() where id = $1', [row.id]);
    await client.query('commit');
    const connectionRow = connectionResult.rows[0];
    if (!connectionRow) throw new Error('Telemetry connection was not created.');
    return {
      token,
      connection: {
        id: connectionRow.id,
        functionId: connectionRow.function_id,
        employeeId: connectionRow.employee_id,
        provider: connectionRow.provider,
      },
    };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateTelemetryToken(
  token: string,
): Promise<TelemetryConnectionIdentity | null> {
  const result = await db().query<{
    id: string;
    function_id: string;
    employee_id: string;
    provider: TelemetryProvider;
  }>(
    `select id, function_id, employee_id, provider
     from public.telemetry_connections
     where token_hash = $1 and status <> 'revoked'
     limit 1`,
    [hashSecret(token)],
  );
  const row = result.rows[0];
  return row
    ? { id: row.id, functionId: row.function_id, employeeId: row.employee_id, provider: row.provider }
    : null;
}

export async function touchTelemetryConnection(connectionId: string): Promise<void> {
  await db().query(
    `update public.telemetry_connections set
       status = 'connected',
       connected_at = coalesce(connected_at, now()),
       last_seen_at = now(),
       last_error = null,
       updated_at = now()
     where id = $1`,
    [connectionId],
  );
}

export async function revokeTelemetryConnection(args: {
  functionId: string;
  employeeId: string;
  provider: TelemetryProvider;
}): Promise<boolean> {
  const result = await db().query(
    `update public.telemetry_connections set
       status = 'revoked', updated_at = now(), token_hash = encode(gen_random_bytes(32), 'hex')
     where function_id = $1 and employee_id = $2 and provider = $3`,
    [args.functionId, args.employeeId, args.provider],
  );
  return (result.rowCount ?? 0) > 0;
}

function eventKey(connectionId: string, event: NormalizedTelemetryEvent): string {
  return createHash('sha256')
    .update(JSON.stringify([connectionId, event]))
    .digest('hex');
}

function isUserPrompt(eventName: string): boolean {
  const name = eventName.toLowerCase();
  return name.includes('user_prompt') || name.includes('user.prompt');
}

export async function persistTelemetryEvents(
  connection: TelemetryConnectionIdentity,
  events: NormalizedTelemetryEvent[],
): Promise<{ accepted: number; duplicates: number; sessionsTouched: number }> {
  const client = await db().connect();
  let accepted = 0;
  let duplicates = 0;
  const sessions = new Set<string>();
  try {
    await client.query('begin');
    for (const event of events.slice(0, 2_000)) {
      const inserted = await client.query(
        `insert into public.telemetry_events
          (connection_id, event_key, provider, source_session_id, event_name, event_time,
           model, tokens_in, tokens_out, cache_read, cache_creation, prompt_chars, success)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         on conflict (event_key) do nothing
         returning id`,
        [
          connection.id,
          eventKey(connection.id, event),
          connection.provider,
          event.sourceSessionId,
          event.eventName,
          event.eventTime,
          event.model,
          event.tokensIn,
          event.tokensOut,
          event.cacheRead,
          event.cacheCreation,
          event.promptChars,
          event.success,
        ],
      );
      if (inserted.rowCount !== 1) {
        duplicates += 1;
        continue;
      }
      accepted += 1;

      if (!event.sourceSessionId) continue;
      sessions.add(event.sourceSessionId);
      const promptCount = event.promptChars === null ? 0 : 1;
      await client.query(
        `insert into public.cc_sessions
          (function_id, employee_id, session_id, repo, branch, ts, turns, tokens_in,
           tokens_out, cache_read, cache_creation, cost_usd, model, suggestions_offered,
           suggestions_accepted, skills_used, prompt_len_avg, pr_refs, source, provider,
           connection_id, source_event_count, prompt_event_count, last_event_at)
         values
          ($1,$2,$3,null,null,$4,$5,$6,$7,$8,$9,null,$10,0,0,'{}',$11,'[]',$12,$12,$13,1,$14,$4)
         on conflict (connection_id, session_id)
           where connection_id is not null and session_id is not null
         do update set
           ts = least(coalesce(cc_sessions.ts, excluded.ts), excluded.ts),
           turns = cc_sessions.turns + excluded.turns,
           tokens_in = cc_sessions.tokens_in + excluded.tokens_in,
           tokens_out = cc_sessions.tokens_out + excluded.tokens_out,
           cache_read = cc_sessions.cache_read + excluded.cache_read,
           cache_creation = cc_sessions.cache_creation + excluded.cache_creation,
           model = coalesce(excluded.model, cc_sessions.model),
           prompt_len_avg = case
             when cc_sessions.prompt_event_count + excluded.prompt_event_count = 0 then null
             else round((
               coalesce(cc_sessions.prompt_len_avg, 0) * cc_sessions.prompt_event_count +
               coalesce(excluded.prompt_len_avg, 0) * excluded.prompt_event_count
             ) / (cc_sessions.prompt_event_count + excluded.prompt_event_count), 2)
           end,
           source_event_count = cc_sessions.source_event_count + 1,
           prompt_event_count = cc_sessions.prompt_event_count + excluded.prompt_event_count,
           last_event_at = greatest(coalesce(cc_sessions.last_event_at, excluded.last_event_at), excluded.last_event_at),
           ingested_at = now()`,
        [
          connection.functionId,
          connection.employeeId,
          event.sourceSessionId,
          event.eventTime,
          isUserPrompt(event.eventName) ? 1 : 0,
          event.tokensIn,
          event.tokensOut,
          event.cacheRead,
          event.cacheCreation,
          event.model,
          event.promptChars,
          connection.provider,
          connection.id,
          promptCount,
        ],
      );
    }

    await client.query(
      `update public.telemetry_connections set
         status = 'connected', connected_at = coalesce(connected_at, now()),
         last_seen_at = now(), last_error = null, updated_at = now()
       where id = $1`,
      [connection.id],
    );
    await client.query('commit');
    return { accepted, duplicates, sessionsTouched: sessions.size };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface ConnectEmployeeRow {
  id: string;
  name: string;
  githubHandle: string | null;
  email: string | null;
  isDemo: boolean;
  codexStatus: string | null;
  codexLastSeenAt: string | null;
  claudeStatus: string | null;
  claudeLastSeenAt: string | null;
}

export interface ConnectOverview {
  schemaReady: boolean;
  github: {
    status: string;
    installationId: number | null;
    org: string | null;
    repos: string[];
    lastSyncAt: string | null;
    lastError: string | null;
    prCount: number;
    commitCount: number;
  };
  employees: ConnectEmployeeRow[];
  sessionCounts: { codex: number; claudeCode: number };
}

export async function getConnectOverview(functionId: string): Promise<ConnectOverview> {
  const empty: ConnectOverview = {
    schemaReady: false,
    github: {
      status: 'not_configured',
      installationId: null,
      org: null,
      repos: [],
      lastSyncAt: null,
      lastError: null,
      prCount: 0,
      commitCount: 0,
    },
    employees: [],
    sessionCounts: { codex: 0, claudeCode: 0 },
  };

  try {
    const [connector, people, evidence, sessions] = await Promise.all([
      db().query<{
        status: string;
        config_jsonb: Record<string, unknown>;
        last_sync_at: string | null;
        last_error: string | null;
      }>(
        `select status, config_jsonb, last_sync_at::text as last_sync_at, last_error
         from public.connectors where function_id = $1 and type = 'github' limit 1`,
        [functionId],
      ),
      db().query<{
        id: string;
        name: string;
        github_handle: string | null;
        email: string | null;
        is_demo: boolean;
        codex_status: string | null;
        codex_last_seen_at: string | null;
        claude_status: string | null;
        claude_last_seen_at: string | null;
      }>(
        `select e.id, e.name, e.github_handle::text, e.email::text, e.is_demo,
           max(tc.status) filter (where tc.provider = 'codex') as codex_status,
           (max(tc.last_seen_at) filter (where tc.provider = 'codex'))::text as codex_last_seen_at,
           max(tc.status) filter (where tc.provider = 'claude_code') as claude_status,
           (max(tc.last_seen_at) filter (where tc.provider = 'claude_code'))::text as claude_last_seen_at
         from public.employees e
         left join public.telemetry_connections tc on tc.employee_id = e.id
         where e.function_id = $1 and e.active = true
         group by e.id
         order by e.is_demo desc, e.name`,
        [functionId],
      ),
      db().query<{ prs: string; commits: string }>(
        `select
           (select count(*) from public.gh_prs where function_id = $1) as prs,
           (select count(*) from public.gh_commits where function_id = $1) as commits`,
        [functionId],
      ),
      db().query<{ provider: string; count: string }>(
        `select provider, count(*)::text as count from public.cc_sessions
         where function_id = $1 and connection_id is not null
         group by provider`,
        [functionId],
      ),
    ]);

    const connectorRow = connector.rows[0];
    const config = connectorRow?.config_jsonb ?? {};
    const sessionCounts = { codex: 0, claudeCode: 0 };
    for (const row of sessions.rows) {
      if (row.provider === 'codex') sessionCounts.codex = Number(row.count);
      if (row.provider === 'claude_code') sessionCounts.claudeCode = Number(row.count);
    }

    return {
      schemaReady: true,
      github: {
        status: connectorRow?.status ?? 'not_configured',
        installationId: Number.isFinite(Number(config.installation_id))
          ? Number(config.installation_id)
          : null,
        org: typeof config.org === 'string' ? config.org : null,
        repos: Array.isArray(config.repo_ids)
          ? config.repo_ids.filter((repo): repo is string => typeof repo === 'string')
          : [],
        lastSyncAt: connectorRow?.last_sync_at ?? null,
        lastError: connectorRow?.last_error ?? null,
        prCount: Number(evidence.rows[0]?.prs ?? 0),
        commitCount: Number(evidence.rows[0]?.commits ?? 0),
      },
      employees: people.rows.map((row) => ({
        id: row.id,
        name: row.name,
        githubHandle: row.github_handle,
        email: row.email,
        isDemo: row.is_demo,
        codexStatus: row.codex_status,
        codexLastSeenAt: row.codex_last_seen_at,
        claudeStatus: row.claude_status,
        claudeLastSeenAt: row.claude_last_seen_at,
      })),
      sessionCounts,
    };
  } catch {
    return empty;
  }
}
