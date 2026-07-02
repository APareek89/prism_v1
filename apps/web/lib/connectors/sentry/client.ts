// lib/connectors/sentry/client.ts
//
// Authenticated Sentry REST client. Keyless-safe: if SENTRY_AUTH_TOKEN / SENTRY_ORG
// / SENTRY_PROJECT are unset, `createSentryClient()` returns null (the connector then
// reports 'not_configured' and writes nothing — Effectiveness F3 simply degrades).
// NOTHING here throws at import; a missing token only surfaces when a runtime path
// actually tries to call Sentry.
//
// Auth: Bearer <SENTRY_AUTH_TOKEN> against the public Sentry REST API (api/0).
// We deliberately use plain fetch (no SDK) so an unconfigured connector costs nothing
// to import.

import { serverEnv, isConfigured } from '@/lib/config/env';

/** Default Sentry SaaS base. Self-hosted installs can override via SENTRY_BASE_URL
 *  if that var is ever added; for now we target sentry.io. */
const DEFAULT_SENTRY_BASE_URL = 'https://sentry.io/api/0';

// ---------------------------------------------------------------------------
// Narrow shapes for the only two Sentry resources we read. Kept minimal and
// defensive — Sentry returns far more than this and we only touch what we map.
// ---------------------------------------------------------------------------

/** A commit reference attached to a release (lastCommit or refs[].commit). */
export interface SentryReleaseCommit {
  id?: string | null; // the commit sha
  repository?: { name?: string | null } | null;
  message?: string | null;
}

/** A Sentry release (a shipped version). `version` is frequently a sha. */
export interface SentryRelease {
  version: string;
  ref?: string | null;
  url?: string | null;
  dateCreated?: string | null;
  dateReleased?: string | null;
  lastCommit?: SentryReleaseCommit | null;
  /** refs tie a release to VCS commits; each ref carries a commit sha. */
  refs?: Array<{ repository?: string | null; commit?: string | null }> | null;
  /** projects this release was deployed to. */
  projects?: Array<{ slug?: string | null; id?: number | string | null }> | null;
}

/** A Sentry issue (an error grouping) → incident candidate. */
export interface SentryIssue {
  id: string;
  shortId?: string | null;
  title?: string | null;
  level?: string | null; // severity: fatal | error | warning | info | debug
  status?: string | null; // resolved | unresolved | ignored
  firstSeen?: string | null;
  lastSeen?: string | null;
  /** the release where this issue first/last appeared (ties incident → deploy). */
  firstRelease?: { version?: string | null } | null;
  lastRelease?: { version?: string | null } | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface SentryClient {
  readonly org: string;
  readonly project: string;
  /** Paginated GET that follows Sentry's RFC-5988 `Link: rel="next"` cursors. */
  listReleases(): Promise<SentryRelease[]>;
  /** Issues for the project. `query` lets callers scope (e.g. by date or release). */
  listIssues(query?: string): Promise<SentryIssue[]>;
}

class SentryRestClient implements SentryClient {
  constructor(
    private readonly token: string,
    public readonly org: string,
    public readonly project: string,
    private readonly baseUrl: string = DEFAULT_SENTRY_BASE_URL,
  ) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /** GET with cursor pagination. Sentry caps pages at 100; we follow Link headers
   *  up to a hard ceiling so a misconfigured project can't loop forever. */
  private async getPaginated<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = `${this.baseUrl}${path}`;
    let guard = 0;
    const MAX_PAGES = 50;

    while (url && guard < MAX_PAGES) {
      guard += 1;
      const res: Response = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Sentry GET ${url} failed: ${res.status} ${res.statusText}${
            body ? ` — ${body.slice(0, 300)}` : ''
          }`,
        );
      }
      const page = (await res.json()) as T[];
      if (Array.isArray(page)) out.push(...page);
      url = nextLink(res.headers.get('link'));
    }
    return out;
  }

  async listReleases(): Promise<SentryRelease[]> {
    // Org-scoped releases endpoint, filtered to our project. per_page=100.
    const path = `/organizations/${encodeURIComponent(this.org)}/releases/?project=${encodeURIComponent(
      this.project,
    )}&per_page=100`;
    return this.getPaginated<SentryRelease>(path);
  }

  async listIssues(query = 'is:unresolved'): Promise<SentryIssue[]> {
    const path = `/projects/${encodeURIComponent(this.org)}/${encodeURIComponent(
      this.project,
    )}/issues/?query=${encodeURIComponent(query)}&per_page=100`;
    return this.getPaginated<SentryIssue>(path);
  }
}

/** Parse the `rel="next"` cursor out of a Sentry Link header. Sentry marks the
 *  trailing page with `results="false"`; we stop there. */
function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // e.g. <https://sentry.io/...&cursor=X>; rel="next"; results="true"; cursor="X"
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const isNext = /rel="next"/.test(part);
    const hasResults = /results="true"/.test(part);
    if (isNext && hasResults) {
      const m = part.match(/<([^>]+)>/);
      if (m && m[1]) return m[1];
    }
  }
  return null;
}

/**
 * Construct the Sentry client, or return null when the connector is not configured.
 * NEVER throws — callers branch on null to stay keyless-safe.
 */
export function createSentryClient(): SentryClient | null {
  if (!isConfigured('sentry')) return null;
  // isConfigured guarantees all three are present & non-empty.
  const token = serverEnv.SENTRY_AUTH_TOKEN as string;
  const org = serverEnv.SENTRY_ORG as string;
  const project = serverEnv.SENTRY_PROJECT as string;
  return new SentryRestClient(token, org, project);
}
