// lib/types/attribution-mode.ts
//
// Standalone home for the AttributionMode enum so lib/config/attribution.ts can
// import it without pulling in the full types barrel (avoids a config↔types cycle).
// Re-exported by lib/types/db.ts and the @/lib/types barrel.

/** Whether an employee's Claude-Code stream is linked and counts toward AI rates. */
export type AttributionMode = 'matched' | 'unmatched' | 'byo';
