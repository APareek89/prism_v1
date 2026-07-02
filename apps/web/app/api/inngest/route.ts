// app/api/inngest/route.ts
//
// The Inngest serve endpoint. Inngest (Dev Server locally, Cloud in prod) discovers and
// invokes Prism's durable functions over this route via the official Next adapter. The
// adapter exposes GET (introspection / registration), POST (function invocation), and PUT
// (registration sync).
//
// KEYLESS-SAFE: serve() constructs no key. Locally the Inngest Dev Server (npm run
// inngest:dev, i.e. `inngest-cli dev -u http://localhost:3000/api/inngest`) reaches this
// endpoint with no signing key. In production INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY are
// read from the environment by the client/handler at request time — never at import — so
// `next build` passes with them absent.

import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { functions } from '@/inngest/functions';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
