// lib/onboarding/provision.ts
//
// THE idempotent provisioning service (architecture §0.1 / §9, PRD §7.2.1). All
// employee onboarding — roster CSV, GitHub org sync, first-connect self-employee —
// flows through `provisionEmployee`, so identity resolution + attribution/match-status
// rules live in exactly one place.
//
//   provisionEmployee(...)  → upsert by github_handle / email (idempotent). Derives
//                             attribution_mode + match_status from the supplied
//                             identity (a telemetry-linkable handle/uuid ⇒ matched).
//   ensureSelfEmployee(...) → create/return the is_demo "self" employee from
//                             DEMO_USER_EMAIL so the demo person is a REAL row the
//                             pipeline scores (never synthetic).
//
// SERVER-ONLY: writes via the service-role CRUD in lib/db/onboarding. Never throws —
// callers (Admin actions / pipeline) get a typed result and surface errors in chrome.

import {
  findByIdentity,
  findSelfEmployee,
  insertEmployee,
  updateEmployee,
  type EmployeeRecord,
} from '@/lib/db/onboarding';
import { serverEnv } from '@/lib/config/env';
import type { AttributionMode } from '@/lib/types/db';

// ─────────────────────────────────────────────────────────────────────────────
// Input / output
// ─────────────────────────────────────────────────────────────────────────────

/** Input to provisionEmployee. Matches the M2 onboarding contract (architecture §9). */
export interface ProvisionEmployeeInput {
  functionId: string;
  name: string;
  designation?: string | null;
  githubHandle?: string | null;
  email?: string | null;
  claudeAccountUuid?: string | null;
  /** Explicit attribution override (e.g. Admin sets 'byo'/'ignored'); else derived. */
  attributionMode?: AttributionMode;
  /** Mark this row the is_demo "self" employee (ensureSelfEmployee path). */
  isDemo?: boolean;
}

/** The provisioning outcome. `ok:false` carries a readable error; never throws. */
export interface ProvisionOutcome {
  ok: boolean;
  employee: EmployeeRecord | null;
  created: boolean;
  error: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation rules
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize an identity string: trim; empty → null. (citext handles case in the DB.) */
function norm(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

/**
 * Derive (attribution_mode, match_status) from the identity. A roster row that carries
 * a telemetry-linkable identity (github_handle or claude_account_uuid) is 'matched' /
 * 'linked'; a row with only a name/email is 'unmatched'. An explicit override wins and
 * maps to the right match_status ('byo' ⇒ byo, 'unmatched' ⇒ unmatched, 'matched' ⇒
 * linked). (AttributionMode is matched|unmatched|byo — 'ignored' is DB-only and set
 * directly by Admin, never derived here.)
 */
export function deriveAttribution(
  identity: { githubHandle?: string | null; claudeAccountUuid?: string | null },
  override?: AttributionMode,
): { attribution_mode: AttributionMode; match_status: EmployeeRecord['match_status'] } {
  if (override) {
    const match_status: EmployeeRecord['match_status'] =
      override === 'matched' ? 'linked' : override === 'byo' ? 'byo' : 'unmatched';
    return { attribution_mode: override, match_status };
  }
  const linkable = Boolean(norm(identity.githubHandle) || norm(identity.claudeAccountUuid));
  return linkable
    ? { attribution_mode: 'matched', match_status: 'linked' }
    : { attribution_mode: 'unmatched', match_status: 'unmatched' };
}

// ─────────────────────────────────────────────────────────────────────────────
// provisionEmployee — idempotent upsert by github_handle / email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Idempotently provision (create or update) an employee. Resolution precedence:
 * github_handle → email → claude_account_uuid. On a hit, merges the supplied identity
 * fields (filling blanks, refreshing name/designation) and recomputes attribution; on
 * a miss, inserts a fresh row. Returns the row + whether it was created. Never throws.
 */
export async function provisionEmployee(input: ProvisionEmployeeInput): Promise<ProvisionOutcome> {
  const functionId = norm(input.functionId);
  const name = norm(input.name);
  if (!functionId) return { ok: false, employee: null, created: false, error: 'functionId is required' };
  if (!name) return { ok: false, employee: null, created: false, error: 'name is required' };

  const githubHandle = norm(input.githubHandle);
  const email = norm(input.email);
  const claudeAccountUuid = norm(input.claudeAccountUuid);
  const designation = norm(input.designation);

  const { attribution_mode, match_status } = deriveAttribution(
    { githubHandle, claudeAccountUuid },
    input.attributionMode,
  );

  // Look for an existing row by identity precedence.
  const existing = await findByIdentity(functionId, { githubHandle, email, claudeAccountUuid });

  if (existing) {
    // Idempotent update: fill missing identity, refresh name/designation, recompute
    // attribution. Preserve is_demo unless this call explicitly sets it true.
    const updated = await updateEmployee(existing.id, {
      name,
      designation: designation ?? existing.designation,
      github_handle: githubHandle ?? existing.github_handle,
      email: email ?? existing.email,
      claude_account_uuid: claudeAccountUuid ?? existing.claude_account_uuid,
      attribution_mode,
      match_status,
      is_demo: input.isDemo === true ? true : existing.is_demo,
      active: true,
    });
    if (!updated) return { ok: false, employee: existing, created: false, error: 'employee update failed' };
    return { ok: true, employee: updated, created: false, error: null };
  }

  const created = await insertEmployee({
    function_id: functionId,
    name,
    designation,
    github_handle: githubHandle,
    email,
    claude_account_uuid: claudeAccountUuid,
    attribution_mode,
    match_status,
    active: true,
    is_demo: input.isDemo === true,
  });
  if (!created) return { ok: false, employee: null, created: false, error: 'employee insert failed' };
  return { ok: true, employee: created, created: true, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// ensureSelfEmployee — the real is_demo "self" row scored by the pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create or return the single is_demo "self" employee for a function. On first
 * connect/scan the demo person needs a REAL employees row (not synthetic) so the
 * pipeline scores them. Identity comes from DEMO_USER_EMAIL (env); the row is marked
 * is_demo + attribution 'byo' (a personal Claude subscription, reimbursable but
 * included). Idempotent: returns the existing self row if one is present.
 */
export async function ensureSelfEmployee(args: {
  functionId: string;
  name?: string;
  designation?: string | null;
  githubHandle?: string | null;
  claudeAccountUuid?: string | null;
}): Promise<ProvisionOutcome> {
  const functionId = norm(args.functionId);
  if (!functionId) return { ok: false, employee: null, created: false, error: 'functionId is required' };

  // Already provisioned? Return it (idempotent).
  const existingSelf = await findSelfEmployee(functionId);
  if (existingSelf) return { ok: true, employee: existingSelf, created: false, error: null };

  const demoEmail = norm(serverEnv.DEMO_USER_EMAIL);
  const name = norm(args.name) ?? (demoEmail ? demoEmail.split('@')[0] : null) ?? 'You';

  // BYO: a personal subscription — flagged for reimbursement but INCLUDED in rates.
  return provisionEmployee({
    functionId,
    name,
    designation: norm(args.designation),
    githubHandle: norm(args.githubHandle),
    email: demoEmail,
    claudeAccountUuid: norm(args.claudeAccountUuid),
    attributionMode: 'byo',
    isDemo: true,
  });
}
