import { z } from 'zod';
import { withCapability } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { managedTeamIds } from '@/lib/auth/scope';

const createSchema = z.object({ operation: z.literal('create'), kind: z.enum(['connector','course','intervention']), title: z.string().min(3).max(160), rationale: z.string().min(3).max(2000), evidence: z.record(z.string(), z.unknown()).default({}), teamId: z.string().uuid().optional(), dueAt: z.string().datetime().nullable().optional() });
const updateSchema = z.object({ operation: z.literal('update'), id: z.string().uuid(), status: z.enum(['planned','in_progress','actioned','verified','dismissed']) });
const schema = z.discriminatedUnion('operation', [createSchema, updateSchema]);

export const POST = withCapability('manage_org_actions', async (request, user) => {
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid action' }, { status: 400 });
  const db: any = createAdminClient();
  const teamScope = await managedTeamIds(user);
  if (parsed.data.operation === 'create') {
    if (teamScope !== null && (!parsed.data.teamId || !teamScope.includes(parsed.data.teamId))) return Response.json({ error: 'Managers may create actions only for teams they manage.' }, { status: 403 });
    const { error } = await db.from('org_actions').insert({ function_id: user.functionId, team_id: parsed.data.teamId ?? null, kind: parsed.data.kind, title: parsed.data.title, rationale: parsed.data.rationale, evidence_jsonb: parsed.data.evidence, created_by_employee_id: user.employeeId, owner_employee_id: user.employeeId, due_at: parsed.data.dueAt ?? null });
    if (error) return Response.json({ error: error.message }, { status: 400 });
  } else {
    if (teamScope !== null) {
      const { data: target, error: targetError } = await db.from('org_actions').select('team_id').eq('id', parsed.data.id).eq('function_id', user.functionId).maybeSingle();
      if (targetError) return Response.json({ error: targetError.message }, { status: 400 });
      if (!target?.team_id || !teamScope.includes(target.team_id)) return Response.json({ error: 'Managers may update actions only for teams they manage.' }, { status: 403 });
    }
    const patch: Record<string, unknown> = { status: parsed.data.status, updated_at: new Date().toISOString() }; if (parsed.data.status === 'actioned') patch.actioned_at = new Date().toISOString();
    const { error } = await db.from('org_actions').update(patch).eq('id', parsed.data.id).eq('function_id', user.functionId); if (error) return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ ok: true, impactClaimed: false });
});
