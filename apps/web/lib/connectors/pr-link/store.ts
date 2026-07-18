import pg from 'pg';
import { getInstallationOctokit } from '@/lib/connectors/github/client';
import type { TelemetryConnectionIdentity } from '@/lib/connectors/telemetry/types';
import type { PrLinkEvidenceInput } from './parse';

const globalForPrLink = globalThis as unknown as { prismPrLinkPool?: pg.Pool };

function db(): pg.Pool {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for PR-link ingest.');
  if (!globalForPrLink.prismPrLinkPool) {
    globalForPrLink.prismPrLinkPool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });
  }
  return globalForPrLink.prismPrLinkPool;
}
function normalizeRepo(repo: string): string {
  return repo.trim().toLowerCase();
}

function repoIncluded(repos: unknown, repo: string): boolean {
  if (!Array.isArray(repos)) return false;
  const target = normalizeRepo(repo);
  return repos.some((candidate) => typeof candidate === 'string' && normalizeRepo(candidate) === target);
}

/**
 * Resolve the GitHub installation only when the bearer connection is active and the
 * repository appears in both authoritative internal scopes. The GitHub-side selected
 * repository list is verified separately by the installation API call.
 */
export async function resolveScopedInstallation(
  connection: TelemetryConnectionIdentity,
  repo: string,
): Promise<number | null> {
  const result = await db().query<{
    function_repos: unknown;
    connector_config: Record<string, unknown> | null;
  }>(
    `select f.repo_ids as function_repos, c.config_jsonb as connector_config
     from public.telemetry_connections tc
     join public.employees e
       on e.id = tc.employee_id and e.function_id = tc.function_id and e.active = true
     join public.functions f on f.id = tc.function_id
     left join public.connectors c
       on c.function_id = tc.function_id and c.type = 'github'
     where tc.id = $1 and tc.function_id = $2 and tc.employee_id = $3
       and tc.provider = $4 and tc.status <> 'revoked'
     limit 1`,
    [connection.id, connection.functionId, connection.employeeId, connection.provider],
  );
  const row = result.rows[0];
  const config = row?.connector_config;
  if (!row || !config || !repoIncluded(row.function_repos, repo) || !repoIncluded(config.repo_ids, repo)) {
    return null;
  }
  const installationId = Number(config.installation_id);
  return Number.isSafeInteger(installationId) && installationId > 0 ? installationId : null;
}

export type GithubPrVerification = 'verified' | 'not_found';

export async function verifyGithubPr(args: {
  installationId: number;
  repo: string;
  prNumber: number;
}): Promise<GithubPrVerification> {
  const [owner, repo] = args.repo.split('/');
  if (!owner || !repo) return 'not_found';
  try {
    const octokit = await getInstallationOctokit(args.installationId);
    await octokit.rest.pulls.get({ owner, repo, pull_number: args.prNumber });
    return 'verified';
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    if (status === 404) return 'not_found';
    throw error;
  }
}

export async function persistPrLinkEvidence(
  connection: TelemetryConnectionIdentity,
  evidence: PrLinkEvidenceInput,
): Promise<{ id: string; inserted: boolean }> {
  const source = connection.provider === 'codex' ? 'codex_hook' : 'claude_code_hook';
  const result = await db().query<{ id: string; inserted: boolean }>(
    `insert into public.pr_link_ingest
       (function_id, employee_id, connection_id, provider, source_session_id,
        repo, pr_number, sha, branch, source, github_verified_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     on conflict (connection_id, source_session_id, repo, pr_number) do update set
       sha = coalesce(excluded.sha, pr_link_ingest.sha),
       branch = coalesce(excluded.branch, pr_link_ingest.branch),
       github_verified_at = excluded.github_verified_at
     returning id, (xmax = 0) as inserted`,
    [
      connection.functionId,
      connection.employeeId,
      connection.id,
      connection.provider,
      evidence.sourceSessionId,
      evidence.repo,
      evidence.prNumber,
      evidence.sha,
      evidence.branch,
      source,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('PR-link evidence was not persisted.');
  return row;
}
