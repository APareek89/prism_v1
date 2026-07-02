// POST /api/v3/user-context — the ONE table the web app writes: real rows from
// real clicks in the Growth tab (course completions, adopted improvements).

import { NextResponse } from 'next/server';
import { v3db } from '@/lib/v3/db';

export const dynamic = 'force-dynamic';

const KINDS = new Set(['course_completed', 'adopted', 'confirmed']);

export async function POST(request: Request): Promise<NextResponse> {
  let body: { developerId?: string; kind?: string; ref?: string; meta?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const { developerId, kind, ref } = body;
  if (!developerId || !kind || !ref || !KINDS.has(kind)) {
    return NextResponse.json({ error: 'developerId, kind (course_completed|adopted|confirmed) and ref are required' }, { status: 400 });
  }
  const { rows } = await v3db().query(
    `insert into v3.user_context (developer_id, kind, ref, meta)
     values ($1, $2, $3, $4)
     on conflict (developer_id, kind, ref) do update set meta = excluded.meta
     returning *`,
    [developerId, kind, ref, JSON.stringify(body.meta ?? {})],
  );
  return NextResponse.json({ row: rows[0] });
}
