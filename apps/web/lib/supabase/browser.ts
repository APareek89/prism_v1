// lib/supabase/browser.ts
//
// The ONE anon browser client (interactive Admin, sign-in form). Uses the public
// anon key + RLS. Constructed LAZILY on first call so importing it in a component
// that may render server-side first never throws keyless. One memoized instance per
// browser tab.

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { requireSupabasePublic } from '@/lib/config/env';
import type { Database } from '@/lib/types/database.generated';

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let _client: BrowserClient | null = null;

/**
 * Get the memoized anon browser client. Throws readably only if Supabase env is
 * missing — and only when actually called (e.g. on a sign-in click), never at import.
 */
export function createClient(): BrowserClient {
  if (_client) return _client;
  const { url, anonKey } = requireSupabasePublic();
  _client = createBrowserClient<Database>(url, anonKey);
  return _client;
}
