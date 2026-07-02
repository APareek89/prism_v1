// lib/config/env.ts
//
// The ONE zod-validated env loader. Keyless-boot contract: nothing here throws at
// import time. Required server vars throw ONLY when actually accessed (lazy) and
// only if missing. Optional connector/agent keys never throw — they surface via
// `isConfigured(connector)` so Admin can show "not configured" instead of crashing.
//
// Split: `publicEnv` (NEXT_PUBLIC_* — safe in the browser) vs `serverEnv`
// (server-only secrets). Access is via getters so an empty `.env.local` still
// lets `next build` succeed.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/**
 * An OPTIONAL secret that must be either genuinely absent OR non-empty. A BLANK string
 * (the natural "turn this off" edit, and how the .env template ships unset keys) is
 * coerced to `undefined` BEFORE validation, so `''` reads as "not configured" instead of
 * throwing "String must contain at least 1 character(s)" for every server-env reader.
 * This keeps the keyless-boot promise ("optional keys never throw") true even when a key
 * is present-but-blank — the exact case that otherwise crashes `next build`.
 */
const optionalSecret = () =>
  z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());

/** Public vars are inlined by Next at build; safe to read eagerly but kept lazy
 *  for symmetry. None are "required" for the build to succeed. */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

/** Server vars. All optional at the schema level (keyless boot); we enforce
 *  "required" lazily in `requireServerEnv` only for the vars a runtime path needs. */
const serverSchema = z.object({
  // App
  APP_ENV: z.enum(['local', 'production']).default('local'),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === '' || v === 'true'),
  // Accept empty string (the .env template ships it blank) or a valid email.
  DEMO_USER_EMAIL: z
    .union([z.string().email(), z.literal('')])
    .optional(),

  // Supabase (the only "required when used" group)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret(),
  SUPABASE_DB_URL: z.string().optional(),

  // Anthropic (M4). optionalSecret ⇒ a blank ANTHROPIC_API_KEY reads as "not configured"
  // (mock-model path) instead of throwing — keeps the keyless build/boot green when the
  // agent key is turned off by blanking it, not just by removing the line.
  ANTHROPIC_API_KEY: optionalSecret(),
  LLM_PROVIDER: z.string().default('anthropic'),
  ANTHROPIC_MODEL: z.string().optional(),
  ANTHROPIC_CLASSIFIER_MODEL: z.string().optional(),

  // GitHub App (M2)
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),

  // Claude Code telemetry (M2)
  CLAUDE_LOCAL_SESSIONS_DIR: z.string().default('~/.claude'),

  // Sentry (M2)
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),

  // Email (M4)
  RESEND_API_KEY: z.string().optional(),
  DIGEST_FROM_EMAIL: z.string().optional(),
  // Svix signing secret for the Resend open/delivery webhook (starts with "whsec_").
  // Optional + keyless-safe: absent ⇒ the webhook rejects unsigned callbacks (200,
  // no patch) rather than trusting them.
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  // Inngest (M4)
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Learning studio (M4)
  LEARNING_STUDIO_BASE_URL: z.string().optional(),
  // Optional bearer token for the studio's auth-gated reads (GET /api/course/:id).
  // Blank in demo; when absent Prism only reaches the studio's public endpoints.
  LEARNING_STUDIO_TOKEN: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

// ---------------------------------------------------------------------------
// Lazy parsing (memoized) — never runs at import unless something reads it.
// ---------------------------------------------------------------------------

let _publicEnv: PublicEnv | null = null;
let _serverEnv: ServerEnv | null = null;

function parsePublic(): PublicEnv {
  if (_publicEnv) return _publicEnv;
  // NEXT_PUBLIC_* must be referenced statically for Next's inliner. We read from
  // process.env (works on the server and is inlined in the client bundle).
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  // Never throw for public env — fall back to safe defaults so the client renders.
  _publicEnv = parsed.success
    ? parsed.data
    : publicSchema.parse({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' });
  return _publicEnv;
}

function parseServer(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Optional-everything schema; a parse failure means a malformed (not missing)
    // value. Surface it readably but only when something actually reads serverEnv.
    throw new Error(
      `Invalid environment variables:\n${parsed.error.issues
        .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  _serverEnv = parsed.data;
  return _serverEnv;
}

/** Lazy public env proxy. Reading any key parses on first access. */
export const publicEnv: PublicEnv = new Proxy({} as PublicEnv, {
  get(_t, prop: string) {
    return parsePublic()[prop as keyof PublicEnv];
  },
});

/** Lazy server env proxy. Reading any key parses on first access. */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_t, prop: string) {
    return parseServer()[prop as keyof ServerEnv];
  },
});

// ---------------------------------------------------------------------------
// Required-var enforcement (lazy, only at the runtime call site)
// ---------------------------------------------------------------------------

/** The Supabase vars are the only ones that are "required when used at runtime". */
const SUPABASE_REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

/**
 * Assert a server var is present, throwing a readable error ONLY at the call
 * site (never at import). Use this inside client constructors right before the
 * value is consumed.
 */
export function requireServerEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = serverEnv[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Missing required environment variable: ${String(key)}. ` +
        `Add it to .env.local. (The app boots keyless, but this runtime path needs it.)`,
    );
  }
  return value as NonNullable<ServerEnv[K]>;
}

/** Assert the Supabase anon/url pair is present (used by server + browser clients). */
export function requireSupabasePublic(): {
  url: string;
  anonKey: string;
} {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      `Supabase is not configured. Set ${SUPABASE_REQUIRED.join(' and ')} in .env.local.`,
    );
  }
  return { url, anonKey };
}

/** Assert the service-role key is present (admin client only). */
export function requireServiceRoleKey(): string {
  return requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
}

// ---------------------------------------------------------------------------
// isConfigured — the optional-connector probe used by Admin + lazy clients.
// ---------------------------------------------------------------------------

export type Connector = 'supabase' | 'anthropic' | 'github' | 'claudeCode' | 'sentry' | 'resend' | 'inngest' | 'learningStudio';

/** True when every env var a connector needs is present. Never throws. */
export function isConfigured(connector: Connector): boolean {
  try {
    switch (connector) {
      case 'supabase':
        return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      case 'anthropic':
        return Boolean(serverEnv.ANTHROPIC_API_KEY);
      case 'github':
        return Boolean(serverEnv.GITHUB_APP_ID && serverEnv.GITHUB_APP_PRIVATE_KEY);
      case 'claudeCode':
        return Boolean(serverEnv.CLAUDE_LOCAL_SESSIONS_DIR);
      case 'sentry':
        return Boolean(serverEnv.SENTRY_AUTH_TOKEN && serverEnv.SENTRY_ORG && serverEnv.SENTRY_PROJECT);
      case 'resend':
        return Boolean(serverEnv.RESEND_API_KEY);
      case 'inngest':
        return Boolean(serverEnv.INNGEST_EVENT_KEY && serverEnv.INNGEST_SIGNING_KEY);
      case 'learningStudio':
        return Boolean(serverEnv.LEARNING_STUDIO_BASE_URL);
      default:
        return false;
    }
  } catch {
    return false;
  }
}
