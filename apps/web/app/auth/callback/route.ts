// app/auth/callback/route.ts
//
// Magic-link callback: exchanges the `?code=` for a session, then redirects to /me.
// Keyless-safe: if Supabase isn't configured, it redirects to sign-in rather than
// throwing. The Supabase server client is constructed lazily inside the handler.

import { NextResponse } from 'next/server';
import { isConfigured, publicEnv } from '@/lib/config/env';
import { createClient } from '@/lib/supabase/server';
import { ROUTES } from '@/lib/config/constants';
import { claimWorkspaceByEmail } from '@/lib/auth/workspace';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  // Render terminates TLS at its proxy, so request.url can contain the internal
  // localhost origin. Always redirect browsers to Prism's configured public URL.
  const origin = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;

  if (!isConfigured('supabase') || (!code && !(tokenHash && type === 'magiclink'))) {
    return NextResponse.redirect(`${origin}${ROUTES.signIn}`);
  }

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'magiclink' });

  if (error) {
    return NextResponse.redirect(`${origin}${ROUTES.signIn}?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.redirect(`${origin}${ROUTES.signIn}?error=unmatched`);
  }

  try {
    const claim = await claimWorkspaceByEmail(user.id, user.email);
    if (claim.employeeId === null) {
      return NextResponse.redirect(`${origin}${ROUTES.signIn}?error=unmatched`);
    }
  } catch {
    return NextResponse.redirect(`${origin}${ROUTES.signIn}?error=workspace`);
  }

  return NextResponse.redirect(`${origin}${ROUTES.me}?welcome=1`);
}
