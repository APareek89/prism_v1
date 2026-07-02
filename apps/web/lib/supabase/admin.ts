// lib/supabase/admin.ts
//
// The ONE service-role client. Bypasses RLS — pipeline / webhook / onboarding ONLY
// (architecture §0.1, ownership-map). Two guards:
//   1. server-only: constructing this in a client bundle throws (window check) so a
//      service-role key can never leak to the browser.
//   2. lazy: the client is constructed on first `createAdminClient()` call, never at
//      import, so an empty `.env.local` still builds.

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireServiceRoleKey, requireSupabasePublic } from '@/lib/config/env';
import type { Database } from '@/lib/types/database.generated';

let _admin: SupabaseClient<Database> | null = null;

/** Hard guard: the service-role client must never be constructed in the browser. */
function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'lib/supabase/admin.ts is server-only. The service-role client must never be ' +
        'imported or constructed in client code.',
    );
  }
}

/**
 * Get the memoized service-role client. RLS-bypassing — restrict to pipeline /
 * webhook / onboarding code paths. Throws readably if the service-role key or
 * Supabase url is missing (only at the call site, never at import).
 */
export function createAdminClient(): SupabaseClient<Database> {
  assertServerOnly();
  if (_admin) return _admin;
  const { url } = requireSupabasePublic();
  const serviceRoleKey = requireServiceRoleKey();
  _admin = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _admin;
}
