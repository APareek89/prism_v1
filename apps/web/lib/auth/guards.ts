// lib/auth/guards.ts
//
// withAuth / withAdmin / withRole wrappers for route handlers and server actions.
// They resolve the AuthUser via the one resolver and enforce roles/capabilities,
// returning a 401/403 Response for route handlers. No duplicate auth logic lives here
// — it all delegates to session.ts + roles.ts.

import type { AppRole, AuthUser, Capability } from '@/lib/types';
import { getAuthUser } from './session';
import { can, hasRole, isAdmin } from './roles';

/** A route handler that receives the resolved user. */
type AuthedHandler<Ctx> = (req: Request, user: AuthUser, ctx: Ctx) => Promise<Response> | Response;

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: 'forbidden' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}

/** Wrap a route handler so it only runs for an authenticated user. */
export function withAuth<Ctx = unknown>(handler: AuthedHandler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    return handler(req, user, ctx);
  };
}

/** Wrap a route handler so it only runs for an admin. */
export function withAdmin<Ctx = unknown>(handler: AuthedHandler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!isAdmin(user)) return forbidden();
    return handler(req, user, ctx);
  };
}

/** Wrap a route handler so it only runs for a user holding one of `roles`. */
export function withRole<Ctx = unknown>(roles: AppRole[], handler: AuthedHandler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!hasRole(user, ...roles)) return forbidden();
    return handler(req, user, ctx);
  };
}

/** Wrap a route handler so it only runs for a user holding `capability`. */
export function withCapability<Ctx = unknown>(capability: Capability, handler: AuthedHandler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const user = await getAuthUser();
    if (!user) return unauthorized();
    if (!can(user, capability)) return forbidden();
    return handler(req, user, ctx);
  };
}

/**
 * Server-action guard: resolve + assert a capability, returning the user or throwing.
 * Use at the top of a server action that mutates protected state.
 */
export async function requireCapability(capability: Capability): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) throw new Error('Unauthorized.');
  if (!can(user, capability)) throw new Error(`Forbidden: missing capability ${capability}.`);
  return user;
}
