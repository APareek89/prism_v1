// lib/adoption/index.ts
//
// Public surface for adoption monitoring (M4 · A2).
// The durable daily pipeline calls monitorAdoption(functionId, date) after
// deriveAndStoreRecommendations, to advance each open rec on fresh evidence.

export { monitorAdoption } from './monitor';
export type { MonitorResult } from './monitor';
export { verifyRec } from './predicates';
export type { Verified } from './predicates';
export {
  nextStatus,
  isTransition,
  isTerminal,
  OPEN_STATUSES,
} from './transitions';
export type { RecStatus, AdoptionSignal } from './transitions';
