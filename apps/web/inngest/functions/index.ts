// inngest/functions/index.ts
//
// The registry of Inngest functions served at /api/inngest. Add every durable function here;
// the serve() handler registers exactly this array with the Inngest Dev Server / Cloud.

import { dailyPipeline } from './daily-pipeline';

/** All Inngest functions Prism serves. Passed verbatim to serve({ functions }). */
export const functions = [dailyPipeline];
