// lib/connectors/github/org-sync.ts
//
// The GitHub-side of org-member sync: discover the people who can author PRs in the
// function's repos (org members, or per-repo collaborators on a personal install) and
// hand them to the ONE onboarding service (lib/onboarding/org-sync.syncOrgMembers),
// which owns the GitHub-member → employee provisioning rules. This module does the
// GitHub fetch and nothing else, so provisioning stays in lib/onboarding.
//
// Today org = me = team (one self employee), but this keeps the system
// multi-employee-ready: a teammate who joins the org/repo is provisioned on the next
// sync. Provisioned joiners derive attribution from their handle (a github_handle is
// telemetry-linkable ⇒ 'matched'/'linked').
//
// SERVER-ONLY (provisioning writes via the service-role client). Degrades cleanly
// (empty result) when the App is not configured.

import type { Octokit } from './client';
import { getInstallationOctokit, isGithubConfigured } from './client';
import { adminDb } from './db';
import { splitRepo } from './backfill';
import {
  syncOrgMembers as provisionOrgMembers,
  type GitHubOrgMember,
  type OrgSyncResult,
} from '@/lib/onboarding/org-sync';

export type { OrgSyncResult };

/** Read the github connector's installation id + org + repos from config_jsonb. */
async function loadGithubConfig(
  functionId: string,
): Promise<{ installationId: number | null; org: string | null; repos: string[] }> {
  try {
    const { data } = await adminDb()
      .from('connectors')
      .select('config_jsonb')
      .eq('function_id', functionId)
      .eq('type', 'github')
      .limit(1)
      .maybeSingle();
    const cfg = (data?.config_jsonb as Record<string, unknown> | null) ?? {};
    const installationId =
      typeof cfg.installation_id === 'number'
        ? cfg.installation_id
        : Number.parseInt(String(cfg.installation_id ?? ''), 10) || null;
    const org = typeof cfg.org === 'string' ? cfg.org : null;
    const repos = Array.isArray(cfg.repo_ids) ? (cfg.repo_ids as string[]) : [];
    return { installationId, org, repos };
  } catch {
    return { installationId: null, org: null, repos: [] };
  }
}

/** Fetch a single user's profile (name + public email) — best effort. */
async function fetchUserProfile(
  octokit: Octokit,
  login: string,
): Promise<{ name: string | null; email: string | null }> {
  try {
    const { data } = await octokit.rest.users.getByUsername({ username: login });
    return { name: data.name?.trim() || null, email: data.email ?? null };
  } catch {
    return { name: null, email: null };
  }
}

/**
 * Discover GitHub members for a function: org members first, falling back to per-repo
 * collaborators when there's no org (personal install). Returns the GitHubOrgMember
 * shape the onboarding service consumes.
 */
export async function discoverMembers(
  octokit: Octokit,
  org: string | null,
  repos: ReadonlyArray<string>,
): Promise<GitHubOrgMember[]> {
  const logins = new Set<string>();

  if (org) {
    try {
      const members = await octokit.paginate(octokit.rest.orgs.listMembers, {
        org,
        per_page: 100,
      });
      for (const m of members) if (m.login) logins.add(m.login);
    } catch {
      // org inaccessible (personal install) → fall through to collaborators
    }
  }

  if (logins.size === 0) {
    for (const slug of repos) {
      const split = splitRepo(slug);
      if (!split) continue;
      try {
        const collabs = await octokit.paginate(octokit.rest.repos.listCollaborators, {
          owner: split.owner,
          repo: split.repo,
          per_page: 100,
        });
        for (const c of collabs) if (c.login) logins.add(c.login);
      } catch {
        // skip inaccessible repo
      }
    }
  }

  const out: GitHubOrgMember[] = [];
  for (const login of logins) {
    const profile = await fetchUserProfile(octokit, login);
    out.push({ login, name: profile.name, email: profile.email });
  }
  return out;
}

/**
 * Sync GitHub org/collaborator members → employees for a function. Discovers members
 * from GitHub, then provisions them through the onboarding service (idempotent upsert by
 * handle). Degrades to an empty result when the App is not configured. Never throws.
 *
 * Named `syncGithubOrgMembers` to avoid colliding with the onboarding service's
 * `syncOrgMembers(functionId, members)` (different signature — that one is the pure
 * member→employee mapper this function feeds).
 */
export async function syncGithubOrgMembers(functionId: string): Promise<OrgSyncResult> {
  const empty: OrgSyncResult = {
    provisioned: 0,
    created: 0,
    updated: 0,
    skipped: [],
    outcomes: [],
    errors: [],
  };
  if (!isGithubConfigured()) return empty;

  const { installationId, org, repos } = await loadGithubConfig(functionId);
  if (!installationId) {
    return { ...empty, errors: ['no installation_id in github connector config'] };
  }

  let octokit: Octokit;
  try {
    octokit = await getInstallationOctokit(installationId);
  } catch (e) {
    return { ...empty, errors: [`installation auth: ${errMsg(e)}`] };
  }

  let members: GitHubOrgMember[];
  try {
    members = await discoverMembers(octokit, org, repos);
  } catch (e) {
    return { ...empty, errors: [`member discovery: ${errMsg(e)}`] };
  }

  return provisionOrgMembers(functionId, members);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
