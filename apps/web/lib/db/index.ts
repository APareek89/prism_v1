// lib/db/index.ts
//
// The @/lib/db barrel — the single import surface the view RSCs use. Every function
// below implements the read-API contract declared at the bottom of
// lib/ui/view-models.ts EXACTLY (names + return types). All reads return safe
// empty/awaiting-signal DTOs when there are no rows (the Supabase schema is live but
// empty until M3) and light up automatically once real data arrives.
//
//   import { getIndex, getRoster, getMyView } from '@/lib/db';

// Identity / window helpers (shared by the view layer).
export {
  getCurrentFunctionId,
  getCurrentEmployeeId,
  getAuthUser,
  currentUser,
  computeWindow,
  WINDOW_DAYS,
  SIZING_WINDOW_DAYS,
  WINDOW_LABEL,
} from './_base';

// Index-scope reads (function / team / employee).
export {
  getMeta,
  getIndex,
  getTrend,
  getTokenStats,
  getImprovements,
  getDrivers,
  emptyIndex,
  emptyTokenStats,
} from './index-read';

// Team roster.
export { getRoster } from './roster';

// Member detail + My view.
export {
  getMember,
  getMemberWell,
  getMemberComms,
  getMyView,
  getPrInsights,
  getRecommendations,
  getCourse,
} from './member';

// Admin reads.
export { getConnectors, getRosterMatches, getIndexConfig, getSizingRule } from './admin';
