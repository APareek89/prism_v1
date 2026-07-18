import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

const schema = z.object({ recommendationId: z.string().uuid(), eventType: z.enum(['acknowledged','started','actioned','dismissed']), note: z.string().max(500).optional() });

export const POST = withAuth(async (request, user) => {
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: 'Invalid action' }, { status: 400 });
  const db: any = createAdminClient();
  const { data: recommendation, error } = await db.from('recommendations').select('id,function_id,employee_id,status').eq('id', parsed.data.recommendationId).eq('employee_id', user.employeeId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 }); if (!recommendation || recommendation.function_id !== user.functionId) return Response.json({ error: 'Recommendation not found' }, { status: 404 });
  const status = parsed.data.eventType === 'dismissed' ? 'dismissed' : parsed.data.eventType === 'acknowledged' ? 'acknowledged' : 'in_progress';
  const { error: updateError } = await db.from('recommendations').update({ status, updated_at: new Date().toISOString() }).eq('id', recommendation.id);
  if (updateError) return Response.json({ error: updateError.message }, { status: 400 });
  const { error: eventError } = await db.from('recommendation_action_events').insert({ recommendation_id: recommendation.id, function_id: user.functionId, employee_id: user.employeeId, event_type: parsed.data.eventType, note: parsed.data.note ?? null });
  if (eventError) return Response.json({ error: eventError.message }, { status: 400 });
  return Response.json({ ok: true, status, impactClaimed: false });
});
