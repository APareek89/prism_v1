// middleware.ts
//
// Session refresh + route protection. Three invariants:
//   1. Keyless-safe: if Supabase isn't configured, or any step throws, we pass the
//      request through unchanged (never 500 a build/boot).
//   2. DEMO short-circuit: in DEMO_MODE we allow every route through (the dev sign-in
//      bypass) — RLS still applies once real keys exist.
//   3. The matcher EXCLUDES webhook / pipeline / courses / inngest / health / static
//      so those never carry an auth redirect.

import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/auth/sign-in', '/auth/callback', '/api/health'];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // DEMO_MODE (default true) → allow everything through. Read the raw env here because
  // middleware runs on the edge runtime without the full config module guarantees.
  const demoMode = process.env.DEMO_MODE !== 'false';
  if (demoMode) {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Keyless: no Supabase configured → don't gate anything (boot must not require keys).
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  let response = NextResponse.next({ request });

  try {
    // Lazy import keeps @supabase/ssr out of the module top-level.
    const { createServerClient } = await import('@supabase/ssr');
    type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }: CookieToSet) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Refresh the session (also the only Supabase Auth touch in middleware).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Gate non-public routes: unauthenticated → sign-in.
    if (!user && !isPublic) {
      const signInUrl = request.nextUrl.clone();
      signInUrl.pathname = '/auth/sign-in';
      return NextResponse.redirect(signInUrl);
    }
  } catch {
    // Any failure (network, malformed key) must not break the request — pass through.
    return response;
  }

  return response;
}

export const config = {
  // Run on everything EXCEPT the excluded API surfaces + static assets. The negative
  // lookahead keeps webhooks / pipeline / courses / inngest / health and Next internals
  // out of the auth path so they're never redirected.
  matcher: [
    '/((?!api/inngest|api/webhooks|api/connectors|api/pipeline|api/courses|api/health|.*/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
