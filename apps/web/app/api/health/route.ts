// app/api/health/route.ts
//
// GET /api/health → { status: 'ok', ... } for Render's healthcheck + smoke checks.
// Keyless-safe: if Supabase isn't configured the db field is 'not_configured'; any
// error during the optional ping is caught so the endpoint NEVER throws.

import { NextResponse } from 'next/server';
import { isConfigured } from '@/lib/config/env';
import { isDemoMode, appEnv } from '@/lib/config/flags';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  let db: 'ok' | 'not_configured' | 'error' = 'not_configured';

  if (isConfigured('supabase')) {
    try {
      // Lazy import so the client is never constructed when Supabase is unconfigured.
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();
      // A trivial, RLS-bypassing ping. Any failure degrades gracefully to 'error'.
      const { error } = await supabase.auth.getSession();
      db = error ? 'error' : 'ok';
    } catch {
      db = 'error';
    }
  }

  return NextResponse.json({
    status: 'ok',
    env: appEnv(),
    demoMode: isDemoMode(),
    db,
    time: new Date().toISOString(),
  });
}
