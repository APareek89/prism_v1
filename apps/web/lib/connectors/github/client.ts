// lib/connectors/github/client.ts
//
// GitHub App authentication. The App's private key is provided as GITHUB_APP_PRIVATE_KEY
// in one of two shapes (architecture / credentials note):
//   1. BASE64 of a PEM  → base64-decode to a standard RSA private-key block. // # pragma: allowlist secret
//   2. a raw PEM, possibly with literal `\n` escapes instead of real newlines.
// We tolerate both. From the App credentials we mint a per-INSTALLATION client that
// carries an installation access token and exposes REST (`octokit.rest`) + GraphQL
// (`octokit.graphql`) for that installation's repos.
//
// KEYLESS-SAFE: nothing here reads env or constructs a client at import. `isGithubConfigured()`
// is a pure probe (no throw) so a not-configured connector degrades cleanly; the App is
// only built on first use.
//
// SERVER-ONLY: uses the App private key. Never import into a client bundle.

import { App, Octokit } from 'octokit';
import { serverEnv, isConfigured } from '@/lib/config/env';

/** True when the GitHub App credentials are present. Never throws. */
export function isGithubConfigured(): boolean {
  return isConfigured('github');
}

/**
 * Decode GITHUB_APP_PRIVATE_KEY into a PEM string. Accepts:
 *   • base64-encoded PEM (the canonical storage form) — decoded to text;
 *   • a raw PEM (already containing `BEGIN ... PRIVATE KEY`) — used as-is;
 *   • a raw PEM with literal `\n` escape sequences — un-escaped to real newlines.
 */
export function decodePrivateKey(raw: string): string {
  const trimmed = raw.trim();

  // Already a PEM? (covers raw PEM with real newlines)
  if (trimmed.includes('-----BEGIN') && trimmed.includes('PRIVATE KEY-----')) {
    return normalizePemNewlines(trimmed);
  }

  // Otherwise treat as base64 and decode.
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.includes('-----BEGIN') && decoded.includes('PRIVATE KEY-----')) {
      return normalizePemNewlines(decoded);
    }
  } catch {
    // fall through
  }

  // Last resort: maybe it's a PEM with escaped `\n` that didn't match the first check.
  const unescaped = normalizePemNewlines(trimmed);
  if (unescaped.includes('-----BEGIN') && unescaped.includes('PRIVATE KEY-----')) {
    return unescaped;
  }

  throw new Error(
    'GITHUB_APP_PRIVATE_KEY is neither a valid base64-encoded PEM nor a raw PEM. ' +
      'Provide the App private key as base64 of the .pem (or the raw PEM).',
  );
}

/** Replace literal `\n` escapes with real newlines (raw-PEM-with-escapes tolerance). */
function normalizePemNewlines(pem: string): string {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

let _app: App | null = null;

/**
 * The memoized App instance (RSA key + app id). Throws readably only when the GitHub
 * App env is missing — and only at the call site, never at import. Callers should gate
 * on `isGithubConfigured()` first for graceful degradation.
 */
export function getApp(): App {
  if (_app) return _app;
  const appId = serverEnv.GITHUB_APP_ID;
  const rawKey = serverEnv.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !rawKey) {
    throw new Error(
      'GitHub App is not configured. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in .env.local.',
    );
  }
  const privateKey = decodePrivateKey(rawKey);
  _app = new App({
    appId,
    privateKey,
    ...(serverEnv.GITHUB_APP_WEBHOOK_SECRET
      ? { webhooks: { secret: serverEnv.GITHUB_APP_WEBHOOK_SECRET } }
      : {}),
    ...(serverEnv.GITHUB_APP_CLIENT_ID && serverEnv.GITHUB_APP_CLIENT_SECRET // # pragma: allowlist secret
      ? { oauth: { clientId: serverEnv.GITHUB_APP_CLIENT_ID, clientSecret: serverEnv.GITHUB_APP_CLIENT_SECRET } } // # pragma: allowlist secret
      : {}),
  });
  return _app;
}

/**
 * An installation-scoped Octokit: REST via `.rest` / `.request`, GraphQL via `.graphql`,
 * pagination via `.paginate`. The token is minted + refreshed by the App auth strategy.
 */
export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const app = getApp();
  return app.getInstallationOctokit(installationId);
}

/** Re-export the Octokit type so consumers (backfill/org-sync) can type their clients. */
export type { Octokit };

/**
 * List every installation of this App (used to auto-discover the installation id when
 * the user installs the App but the connect call doesn't carry it). Returns [] when the
 * App is not configured rather than throwing.
 */
export async function listInstallations(): Promise<
  Array<{ id: number; account: string | null }>
> {
  if (!isGithubConfigured()) return [];
  try {
    const app = getApp();
    const out: Array<{ id: number; account: string | null }> = [];
    for await (const { installation } of app.eachInstallation.iterator()) {
      const account = installation.account as { login?: string; slug?: string } | null;
      out.push({ id: installation.id, account: account?.login ?? account?.slug ?? null });
    }
    return out;
  } catch {
    return [];
  }
}
