// lib/connectors/github/index.ts
//
// The GitHub connector module. Owns:
//   • the GitHubConnector class (status/connect/backfill/handleWebhook) used by Admin
//     actions, and
//   • the THREE free-function entry points the connectors barrel re-exports
//     (architecture §5): ingestGitHub, backfillRepo, handleGitHubWebhook.
//
// It owns the `connectors` row (type='github') health + config via the shared
// lib/connectors/status helpers, provisions the real installation owner via the
// onboarding service, and orchestrates backfill.ts + org-sync.ts + the AI-line capture
// in lib/connectors/blame. Team members are always provisioned from real GitHub
// identities; this connector never creates a placeholder employee.
//
// KEYLESS-SAFE: status() returns 'not_configured' and writes nothing when the App env is
// absent; nothing throws at import. All writes go through the service-role admin client.

import { Webhooks } from '@octokit/webhooks';
import { serverEnv } from '@/lib/config/env';
import type { ConnectorStatus } from '@/lib/types/db';
import {
  getConnectorRecord,
  getConnectorStatus,
  setStatus,
  upsertConfig,
  touchLastSync,
} from '@/lib/connectors/status';
import { provisionEmployee } from '@/lib/onboarding/provision';
import { adminDb } from './db';
import {
  getInstallationOctokit,
  isGithubConfigured,
  listInstallations,
  type Octokit,
} from './client';
import {
  backfillFunction,
  backfillRepo as backfillRepoLowLevel,
  loadSizingPolicy,
  type RepoBackfillResult,
} from './backfill';
import { syncGithubOrgMembers } from './org-sync';

const GITHUB = 'github' as const;

/** A summary of a backfill run, surfaced to the pipeline log / Admin. */
export interface GithubBackfillSummary {
  repos: RepoBackfillResult[];
  prsUpserted: number;
  commitsUpserted: number;
  revertsMarked: number;
  errors: string[];
}

/** The connector's persisted config_jsonb shape. The index signature keeps it
 *  assignable to the `Record<string, unknown>` config the status helpers accept. */
interface GithubConnectorConfig {
  installation_id?: number;
  org?: string | null;
  repo_ids?: string[];
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHubConnector class
// ─────────────────────────────────────────────────────────────────────────────

export class GitHubConnector {
  constructor(private readonly functionId: string) {}

  /** Current connector health. Never throws — 'not_configured' when the App env is absent. */
  async status(): Promise<ConnectorStatus> {
    if (!isGithubConfigured()) return 'not_configured';
    return getConnectorStatus(this.functionId, GITHUB);
  }

  /**
   * Connect the App installation to this function: persist the installation id + repos
   * onto the connectors row, mirror repos onto functions.repo_ids, ensure the self
   * employee exists, and sync org members. Marks the connector 'connected' on success.
   */
  async connect(installationId: number, repoIds: ReadonlyArray<string>): Promise<ConnectorStatus> {
    if (!isGithubConfigured()) return 'not_configured';

    const octokit = await getInstallationOctokit(installationId);
    const org = await this.discoverOrg(installationId);

    const config: GithubConnectorConfig = {
      installation_id: installationId,
      org,
      repo_ids: [...repoIds],
    };
    await upsertConfig(this.functionId, GITHUB, config, 'connected');

    // Mirror repos onto the function so the rest of the system sees the scope.
    try {
      await adminDb()
        .from('functions')
        .update({ repo_ids: [...repoIds], updated_at: new Date().toISOString() })
        .eq('id', this.functionId);
    } catch {
      // non-fatal: connector config still records the repos.
    }

    // Provision the installation owner from the real GitHub identity.
    try {
      const me = await this.discoverSelfIdentity(octokit);
      await provisionEmployee({
        functionId: this.functionId,
        name: me.name ?? me.githubHandle ?? 'GitHub user',
        githubHandle: me.githubHandle,
      });
    } catch {
      // non-fatal: backfill resolves authors lazily; org-sync provisions joiners.
    }

    // Onboard org/collaborator members.
    try {
      await syncGithubOrgMembers(this.functionId);
    } catch {
      // non-fatal
    }

    return 'connected';
  }

  /**
   * Backfill PRs/commits/reverts for the function's repos. Marks the connector 'syncing'
   * for the duration, then 'connected' (or 'error') on completion.
   */
  async backfill(): Promise<GithubBackfillSummary> {
    if (!isGithubConfigured()) {
      return { repos: [], prsUpserted: 0, commitsUpserted: 0, revertsMarked: 0, errors: ['not configured'] };
    }
    const cfg = await this.loadConfig();
    if (!cfg.installation_id) {
      await setStatus(this.functionId, GITHUB, 'error', 'no installation_id');
      return { repos: [], prsUpserted: 0, commitsUpserted: 0, revertsMarked: 0, errors: ['no installation_id'] };
    }
    const repos = cfg.repo_ids ?? [];

    await setStatus(this.functionId, GITHUB, 'syncing');
    try {
      const octokit = await getInstallationOctokit(cfg.installation_id);
      const repoResults = await backfillFunction(octokit, this.functionId, repos);

      const summary: GithubBackfillSummary = {
        repos: repoResults,
        prsUpserted: repoResults.reduce((n, r) => n + r.prsUpserted, 0),
        commitsUpserted: repoResults.reduce((n, r) => n + r.commitsUpserted, 0),
        revertsMarked: repoResults.reduce((n, r) => n + r.revertsMarked, 0),
        errors: repoResults.flatMap((r) => r.errors.map((e) => `${r.repo}: ${e}`)),
      };

      // touchLastSync also flips status → 'connected' and clears last_error.
      await touchLastSync(this.functionId, GITHUB);
      if (summary.errors.length) {
        // Record a soft error message without leaving the connector in 'error' state.
        await upsertConfig(this.functionId, GITHUB, cfg, 'connected');
      }
      return summary;
    } catch (e) {
      const msg = errMsg(e);
      await setStatus(this.functionId, GITHUB, 'error', msg);
      return { repos: [], prsUpserted: 0, commitsUpserted: 0, revertsMarked: 0, errors: [msg] };
    }
  }

  /** Backfill a single repo by slug (lower-level entry for the barrel's backfillRepo). */
  async backfillSingleRepo(repoSlug: string): Promise<RepoBackfillResult> {
    if (!isGithubConfigured()) {
      return { repo: repoSlug, prsUpserted: 0, commitsUpserted: 0, revertsMarked: 0, errors: ['not configured'] };
    }
    const cfg = await this.loadConfig();
    if (!cfg.installation_id) {
      return { repo: repoSlug, prsUpserted: 0, commitsUpserted: 0, revertsMarked: 0, errors: ['no installation_id'] };
    }
    const octokit = await getInstallationOctokit(cfg.installation_id);
    const policy = await loadSizingPolicy(this.functionId);
    const res = await backfillRepoLowLevel(octokit, this.functionId, repoSlug, policy);
    await touchLastSync(this.functionId, GITHUB);
    return res;
  }

  /**
   * Verify + handle a GitHub webhook. Verifies the signature against
   * GITHUB_APP_WEBHOOK_SECRET, then ingests the affected PR (on pull_request events).
   * Never throws on a bad signature — returns { ok:false } so the route can answer
   * 401/400 cleanly.
   */
  async handleWebhook(input: {
    event: string;
    signature: string | null;
    payload: string;
  }): Promise<{ ok: boolean; handled: boolean; detail: string }> {
    const secret = serverEnv.GITHUB_APP_WEBHOOK_SECRET;
    if (!secret) return { ok: false, handled: false, detail: 'webhook secret not configured' };
    if (!input.signature) return { ok: false, handled: false, detail: 'missing signature' };

    const webhooks = new Webhooks({ secret });
    let verified = false;
    try {
      verified = await webhooks.verify(input.payload, input.signature);
    } catch {
      verified = false;
    }
    if (!verified) return { ok: false, handled: false, detail: 'invalid signature' };

    if (input.event !== 'pull_request') {
      return { ok: true, handled: false, detail: `ignored event ${input.event}` };
    }

    let body: WebhookPullRequestPayload;
    try {
      body = JSON.parse(input.payload) as WebhookPullRequestPayload;
    } catch {
      return { ok: true, handled: false, detail: 'unparseable payload' };
    }

    const number = body.pull_request?.number;
    const repoSlug = body.repository?.full_name ?? null;
    const installationId = body.installation?.id ?? (await this.loadConfig()).installation_id ?? null;
    if (!number || !repoSlug || !installationId) {
      return { ok: true, handled: false, detail: 'missing pr/repo/installation' };
    }

    try {
      const octokit = await getInstallationOctokit(installationId);
      const policy = await loadSizingPolicy(this.functionId);
      // Narrow lookback keeps the webhook fast; the updated PR is the most-recent.
      const res = await backfillRepoLowLevel(octokit, this.functionId, repoSlug, policy, {
        lookbackDays: 1,
      });
      await touchLastSync(this.functionId, GITHUB);
      return {
        ok: true,
        handled: true,
        detail: `pr #${number} on ${repoSlug}: ${res.prsUpserted} pr / ${res.commitsUpserted} commits`,
      };
    } catch (e) {
      return { ok: true, handled: false, detail: errMsg(e) };
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async loadConfig(): Promise<GithubConnectorConfig> {
    const rec = await getConnectorRecord(this.functionId, GITHUB);
    return (rec?.config_jsonb as GithubConnectorConfig | undefined) ?? {};
  }

  /** Resolve the org login from the installation account (null for personal installs). */
  private async discoverOrg(installationId: number): Promise<string | null> {
    try {
      const installs = await listInstallations();
      const found = installs.find((i) => i.id === installationId);
      return found?.account ?? null;
    } catch {
      return null;
    }
  }

  /** Best-effort real identity from the installation account. */
  private async discoverSelfIdentity(
    octokit: Octokit,
  ): Promise<{ name: string | null; githubHandle: string | null; email: string | null }> {
    try {
      const installs = await listInstallations();
      const account = installs[0]?.account ?? null;
      if (account) {
        try {
          const { data } = await octokit.rest.users.getByUsername({ username: account });
          return { name: data.name?.trim() || account, githubHandle: account, email: data.email ?? null };
        } catch {
          return { name: account, githubHandle: account, email: null };
        }
      }
    } catch {
      // fall through
    }
    return { name: null, githubHandle: null, email: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Barrel entry points (free functions) — the contract lib/connectors/index re-exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full GitHub ingest for a function: backfill every repo in scope (PRs, commits,
 * reverts) and refresh the connector health. Keyless-safe (no-op summary when the App is
 * not configured). This is the pipeline's GitHub step.
 */
export async function ingestGitHub(functionId: string): Promise<GithubBackfillSummary> {
  return new GitHubConnector(functionId).backfill();
}

/**
 * Backfill a single repo by slug for a function (the barrel's `backfillRepo`). Resolves
 * the installation from the connector config. Keyless-safe.
 */
export async function backfillRepo(
  functionId: string,
  repoSlug: string,
): Promise<RepoBackfillResult> {
  return new GitHubConnector(functionId).backfillSingleRepo(repoSlug);
}

/**
 * Handle an incoming GitHub webhook Request (Next route handler passes the raw Request).
 * Reads the raw body + signature headers, verifies, and ingests the affected PR. The
 * function is resolved from the single bootstrap function (org = me = team today).
 */
export async function handleGitHubWebhook(
  req: Request,
): Promise<{ ok: boolean; handled: boolean; detail: string }> {
  const event = req.headers.get('x-github-event') ?? '';
  const signature =
    req.headers.get('x-hub-signature-256') ?? req.headers.get('x-hub-signature') ?? null;
  const payload = await req.text();

  const functionId = await resolveWebhookFunctionId(payload);
  if (!functionId) {
    return { ok: true, handled: false, detail: 'no function to route webhook to' };
  }
  return new GitHubConnector(functionId).handleWebhook({ event, signature, payload });
}

/**
 * Resolve which function a webhook belongs to. Today there is exactly one bootstrap
 * function; we match the github connector whose config carries the payload's installation
 * id, falling back to the single function row.
 */
async function resolveWebhookFunctionId(payload: string): Promise<string | null> {
  let installationId: number | null = null;
  try {
    const body = JSON.parse(payload) as WebhookPullRequestPayload;
    installationId = body.installation?.id ?? null;
  } catch {
    installationId = null;
  }

  const db = adminDb();
  try {
    if (installationId !== null) {
      const { data } = await db
        .from('connectors')
        .select('function_id, config_jsonb')
        .eq('type', GITHUB)
        .limit(50);
      const rows = (data as Array<{ function_id: string; config_jsonb: GithubConnectorConfig }> | null) ?? [];
      const match = rows.find((r) => r.config_jsonb?.installation_id === installationId);
      if (match) return match.function_id;
    }
  } catch {
    // fall through to single-function fallback
  }

  try {
    const { data } = await db.from('functions').select('id').limit(1).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Minimal webhook payload shape (only the fields we read). */
interface WebhookPullRequestPayload {
  pull_request?: { number?: number };
  repository?: { full_name?: string };
  installation?: { id?: number };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
