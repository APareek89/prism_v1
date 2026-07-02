// lib/onboarding/org-sync.ts
//
// Map a GitHub org member → provisionEmployee (architecture §9, "org-member sync
// onboards joiners"). The GitHub connector (lib/connectors/github) lists org members
// and hands each one here; this module owns the GitHub-member → employee mapping and
// nothing else, so the provisioning rules stay in lib/onboarding/provision.
//
// A GitHub org member always carries a linkable identity (the login → github_handle),
// so synced members provision as 'matched' / 'linked' by default.

import { provisionEmployee, type ProvisionOutcome } from './provision';

// ─────────────────────────────────────────────────────────────────────────────
// GitHub member shape (the subset of the org-members API we consume)
// ─────────────────────────────────────────────────────────────────────────────

/** The fields we read off a GitHub org member (from octokit's listMembers + a user). */
export interface GitHubOrgMember {
  /** the GitHub login → employees.github_handle. */
  login: string;
  /** display name (user.name); falls back to login when GitHub has none. */
  name?: string | null;
  /** public/primary email if exposed; usually null for org members. */
  email?: string | null;
}

/** The outcome of syncing a batch of org members. */
export interface OrgSyncResult {
  /** members provisioned (created + updated). */
  provisioned: number;
  created: number;
  updated: number;
  skipped: Array<{ login: string; reason: string }>;
  outcomes: ProvisionOutcome[];
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Single member → employee
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provision one GitHub org member into `functionId`. Idempotent (upsert by
 * github_handle). The login becomes github_handle; name falls back to the login.
 */
export async function syncOrgMember(
  functionId: string,
  member: GitHubOrgMember,
): Promise<ProvisionOutcome> {
  const login = member.login?.trim();
  if (!login) {
    return { ok: false, employee: null, created: false, error: 'github member has no login' };
  }
  return provisionEmployee({
    functionId,
    name: member.name?.trim() || login,
    githubHandle: login,
    email: member.email ?? null,
    // A GitHub-handle-bearing member is telemetry-linkable ⇒ provision derives
    // attribution 'matched' / match_status 'linked' automatically.
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch sync
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provision a batch of GitHub org members into `functionId`. Members with no login are
 * skipped (not fatal). Returns a per-member summary; never throws.
 */
export async function syncOrgMembers(
  functionId: string,
  members: GitHubOrgMember[],
): Promise<OrgSyncResult> {
  const result: OrgSyncResult = {
    provisioned: 0,
    created: 0,
    updated: 0,
    skipped: [],
    outcomes: [],
    errors: [],
  };

  for (const member of members) {
    const login = member.login?.trim();
    if (!login) {
      result.skipped.push({ login: member.login ?? '(empty)', reason: 'missing login' });
      continue;
    }
    const outcome = await syncOrgMember(functionId, member);
    result.outcomes.push(outcome);
    if (outcome.ok) {
      result.provisioned += 1;
      if (outcome.created) result.created += 1;
      else result.updated += 1;
    } else {
      result.errors.push(`${login}: ${outcome.error ?? 'provision failed'}`);
    }
  }

  return result;
}
