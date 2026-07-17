// lib/connectors/identity.ts
//
// THE single identity chokepoint for connectors. Every connector resolves an
// author/owner to an employees.id through these three resolvers
// (github_handle / claude_account_uuid / email). Connectors never query `employees`
// directly — they all go through here so the matched/unmatched decision lives in one
// place (architecture §0.1, §7.2.1).
//
// This module deliberately delegates rather than duplicates:
//   • resolution reuses the low-level finders in lib/db/onboarding (the employees CRUD
//     floor — citext columns, the exact 0003 schema);
//   • PROVISIONING (creating GitHub-discovered joiners) reuses the ONE
//     idempotent service in lib/onboarding/provision. We re-export it so connectors have
//     a single import surface but the rules stay in exactly one place.
//
// SERVER-ONLY: the underlying CRUD uses the service-role admin client. Never import into
// a client bundle.

import {
  findByGithubHandle,
  findByClaudeUuid,
  findByEmail,
} from '@/lib/db/onboarding';

// Re-export the provisioning service so connectors (org-sync, the connector connect
// path) provision through the same chokepoint they resolve through.
export { provisionEmployee } from '@/lib/onboarding/provision';
export type { ProvisionEmployeeInput, ProvisionOutcome } from '@/lib/onboarding/provision';

/** Normalize a GitHub handle for comparison (strip leading @; trim). citext handles
 *  case in the DB, so we only strip the cosmetic `@` and surrounding whitespace. */
export function normalizeHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const h = handle.trim().replace(/^@/, '');
  return h.length ? h : null;
}

/** Normalize an email for comparison (trim). Returns null when clearly not an email. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim();
  return e.length && e.includes('@') ? e : null;
}

/**
 * Resolve a GitHub handle → employees.id (scoped to the function). Returns null when no
 * employee owns that handle (caller leaves employee_id null → unattributed raw row,
 * which scoring treats as an excluded/insufficient signal — never fabricated).
 */
export async function resolveEmployeeByGithubHandle(
  functionId: string,
  handle: string | null | undefined,
): Promise<string | null> {
  const h = normalizeHandle(handle);
  if (!h) return null;
  const emp = await findByGithubHandle(functionId, h);
  return emp?.id ?? null;
}

/** Resolve a Claude account uuid → employees.id (scoped to the function). */
export async function resolveEmployeeByClaudeUuid(
  functionId: string,
  accountUuid: string | null | undefined,
): Promise<string | null> {
  const u = accountUuid?.trim();
  if (!u) return null;
  const emp = await findByClaudeUuid(functionId, u);
  return emp?.id ?? null;
}

/** Resolve an email → employees.id (scoped to the function). Last-resort identity key. */
export async function resolveEmployeeByEmail(
  functionId: string,
  email: string | null | undefined,
): Promise<string | null> {
  const e = normalizeEmail(email);
  if (!e) return null;
  const emp = await findByEmail(functionId, e);
  return emp?.id ?? null;
}

/**
 * Best-effort identity resolution across all three keys, in priority order
 * (handle → claude uuid → email). Returns the first hit, or null when none match.
 */
export async function resolveEmployee(
  functionId: string,
  keys: { githubHandle?: string | null; claudeUuid?: string | null; email?: string | null },
): Promise<string | null> {
  return (
    (await resolveEmployeeByGithubHandle(functionId, keys.githubHandle)) ??
    (await resolveEmployeeByClaudeUuid(functionId, keys.claudeUuid)) ??
    (await resolveEmployeeByEmail(functionId, keys.email))
  );
}
