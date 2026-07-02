// lib/supabase/server.ts
//
// The ONE RLS-aware server client (RSC + route handlers + server actions). Typed
// with `Database`. Constructed LAZILY per request via createServerClient — never at
// import — so an empty `.env.local` still lets the app build. Cookies come from
// next/headers so Supabase Auth + RLS see the caller's JWT.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireSupabasePublic } from '@/lib/config/env';
import type { Database } from '@/lib/types/database.generated';

/** Shape of one cookie the Supabase ssr client asks us to set. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/** A minimal loosely-typed query-builder surface for tables not yet in the generated
 *  `Database` placeholder. App row types from `@/lib/types` are applied at the call
 *  site via casts. Remove these escape hatches once `npm run db:types` is run. */
interface LooseQuery {
  select: (cols: string) => LooseFilter;
  insert: (rows: unknown) => LooseFilter;
  update: (patch: unknown) => LooseFilter;
  upsert: (rows: unknown, opts?: unknown) => LooseFilter;
  delete: () => LooseFilter;
}
interface LooseFilter extends Promise<{ data: unknown; error: unknown }> {
  eq: (col: string, val: unknown) => LooseFilter;
  order: (col: string, opts?: unknown) => LooseFilter;
  limit: (n: number) => LooseFilter;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
  single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}
interface LooseClient {
  from: (table: string) => LooseQuery;
}

/**
 * Escape hatch for querying app tables not yet present in the generated `Database`
 * placeholder. Typed loosely so M0 builds keyless; tighten to the typed client once
 * `npm run db:types` regenerates the schema.
 */
export function appTable(client: unknown): LooseClient {
  return client as LooseClient;
}

/**
 * Create a per-request RLS-scoped Supabase client. Call inside a Server Component,
 * route handler, or server action — it reads the request cookies. Throws a readable
 * error only if Supabase env is missing (i.e. only when actually used at runtime).
 */
export async function createClient() {
  const { url, anonKey } = requireSupabasePublic();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // `setAll` is called from a Server Component where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore here.
        }
      },
    },
  });
}
