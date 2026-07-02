// app/auth/callback/route.ts
//
// Magic-link callback: exchanges the `?code=` for a session, then redirects to /me.
// Keyless-safe: if Supabase isn't configured, it redirects to sign-in rather than
// throwing. The Supabase server client is constructed lazily inside the handler.

import { NextResponse } from 'next/server';
import { isConfigured } from '@/lib/config/env';
import { createClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/config/constants';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const origin = url.origin;

  if (!isConfigured('supabase') || !code) {
    return NextResponse.redirect(`${origin}${ROUTES.signIn}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${ROUTES.signIn}?error=auth`);
  }

  return NextResponse.redirect(`${origin}${ROUTES.me}`);
}
