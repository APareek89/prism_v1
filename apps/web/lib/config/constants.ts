// lib/config/constants.ts
//
// App-wide deterministic constants (windows, cohort thresholds, confidence bands,
// periods, routes). Presentation + cross-cutting only — the scoring engine keeps
// its own authoritative copies in lib/scoring/constants.ts (reconciled at M3).

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/** Rolling compute window for KPIs/index (PRD §4). */
export const WINDOW_DAYS = 28;

/** Frozen sizing-tertile window (PRD §4.3). */
export const SIZING_WINDOW_DAYS = 90;

// ---------------------------------------------------------------------------
// Cohort + confidence
// ---------------------------------------------------------------------------

/** Below this member count, confidence drops one band (PRD §4.6). */
export const SMALL_COHORT_N = 8;

/** Confidence is the sum of qualifying L2 weights (0–1). Band thresholds (PRD §4.6). */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.75,
  medium: 0.55,
  low: 0.4,
} as const;

/** Below this, L1 is suppressed and only partials render (drives EmptyState). */
export const SUPPRESS_L1_BELOW = 0.4;

// ---------------------------------------------------------------------------
// Periods (presentation toggle: trend granularity + delta baseline)
// ---------------------------------------------------------------------------

export type Period = 'daily' | 'weekly' | 'monthly';

export const PERIODS: readonly Period[] = ['daily', 'weekly', 'monthly'] as const;

export const DEFAULT_PERIOD: Period = 'weekly';

export const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** Parse a `?period=` query value into a valid Period, falling back to the default. */
export function parsePeriod(raw: string | string[] | undefined): Period {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (PERIODS as readonly string[]).includes(v ?? '') ? (v as Period) : DEFAULT_PERIOD;
}

// ---------------------------------------------------------------------------
// Routes — single source of truth for path strings.
// ---------------------------------------------------------------------------

export const ROUTES = {
  home: '/',
  function: '/function',
  team: '/team',
  member: (memberId: string) => `/team/${memberId}`,
  me: '/me',
  configure: '/configure',
  course: (courseId: string) => `/me/courses/${courseId}`,
  admin: '/admin',
  signIn: '/auth/sign-in',
  authCallback: '/auth/callback',
  health: '/api/health',
} as const;
