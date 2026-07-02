// lib/auth/demo-signin.ts
//
// DEMO_MODE-only dev sign-in server action. Hard-throws if DEMO_MODE is false so it
// can never be a production back door. In the keyless demo it simply redirects to
// /me — the session resolver returns the synthetic demo user (no real session, no DB).
// Once Supabase is configured, this is where a dev-only password/OTP sign-in would
// be wired (left minimal for M0).

'use server';

import { redirect } from 'next/navigation';
import { isDemoMode } from '@/lib/config/flags';
import { ROUTES } from '@/lib/config/constants';

/**
 * Continue as the demo user. Only callable in DEMO_MODE. Redirects to /me, where the
 * resolver hands back the synthetic demo identity (keyless) or the real demo employee
 * once Supabase is configured.
 */
export async function demoSignIn(): Promise<void> {
  if (!isDemoMode()) {
    throw new Error('demoSignIn is only available when DEMO_MODE is enabled.');
  }
  redirect(ROUTES.me);
}
