// inngest/client.ts
//
// The ONE Inngest client (app id 'prism'). Inngest is the durable-execution backbone for
// M4's daily automation loop: it drives the cron-scheduled pipeline and step-level retries
// so a transient connector/agent failure resumes instead of losing the whole run.
//
// KEYLESS-SAFE: constructing the Inngest client does NOT require any key. INNGEST_EVENT_KEY
// / INNGEST_SIGNING_KEY only matter when talking to Inngest Cloud; locally the Inngest Dev
// Server (npm run inngest:dev) discovers the app over the /api/inngest endpoint with no key.
// So `new Inngest(...)` is safe at import and `next build` passes with the keys absent.
//
// The typed event schema lives in ./events; the client binds it so step.run / inngest.send
// are type-checked end-to-end.

import { EventSchemas, Inngest } from 'inngest';
import type { PrismEvents } from './events';

/**
 * The Prism Inngest client. `id` is the durable app identity Inngest uses to register and
 * route functions; keep it stable ('prism') so historical runs stay attached across deploys.
 *
 * We pass the typed event schema via EventSchemas().fromRecord so every function's event
 * payload (data shape) is inferred, and inngest.send() rejects an event name/data mismatch.
 */
export const inngest = new Inngest({
  id: 'prism',
  schemas: new EventSchemas().fromRecord<PrismEvents>(),
});
