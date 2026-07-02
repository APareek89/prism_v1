// lib/types/onboarding.ts
//
// Onboarding / provisioning CONTRACTS (M2 logic, types declared at M0 so the shared
// barrel is stable). `lib/onboarding/provision.ts` is the one idempotent service;
// these are its input/output shapes (architecture §0.1, §9).

import type { AttributionMode } from './db';

/** Input to the idempotent provisioning service (upsert by handle/email). */
export interface ProvisionInput {
  functionId: string;
  displayName: string;
  email?: string | null;
  githubHandle?: string | null;
  accountUuid?: string | null;
  attributionMode?: AttributionMode;
  managerId?: string | null;
}

/** Result of a provisioning upsert. */
export interface ProvisionResult {
  employeeId: string;
  created: boolean;
  attributionMode: AttributionMode;
  isMatched: boolean;
}

/** One parsed roster CSV row (papaparse + zod at M2). */
export interface RosterCsvRow {
  display_name: string;
  email?: string;
  github_handle?: string;
}
