// POST /api/v3/agent — run the coaching agent for one developer against the
// active pin. Body: { developerId }. Returns the run summary (model, counts).

import { NextResponse } from 'next/server';
import { activePin } from '@/lib/v3/read';
import { runAgentFor } from '@/lib/v3/agents/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request): Promise<NextResponse> {
  let body: { developerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body.developerId || typeof body.developerId !== 'string') {
    return NextResponse.json({ error: 'developerId is required' }, { status: 400 });
  }
  try {
    const pin = await activePin();
    const summary = await runAgentFor(body.developerId, pin);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'agent run failed' },
      { status: 500 },
    );
  }
}
