import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller, isFirmAdmin } from '@/lib/bearerAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FIRM_ROLES = ['owner', 'firm_admin', 'manager', 'realtor', 'agent'];

/**
 * POST { action: 'remove' | 'role', user_id, role? }
 * Admin-only. Mirrors removeMemberAction / changeMemberRoleAction for mobile.
 */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.firm_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isFirmAdmin(me.role))
    return NextResponse.json({ error: 'Only owners and admins can manage the team.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const userId = String(body.user_id || '');
  if (!userId) return NextResponse.json({ error: 'Missing user_id.' }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  const { data: target } = await service
    .from('users')
    .select('id, firm_id, role')
    .eq('id', userId)
    .maybeSingle();
  if (!target || (target as any).firm_id !== me.firm_id)
    return NextResponse.json({ error: 'User not in your firm.' }, { status: 404 });

  if (action === 'role') {
    const role = String(body.role || '');
    if (!FIRM_ROLES.includes(role))
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    // Don't demote the last owner.
    if ((target as any).role === 'owner' && role !== 'owner') {
      const { count } = await service
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('firm_id', me.firm_id)
        .eq('role', 'owner');
      if ((count || 0) <= 1)
        return NextResponse.json(
          { error: "Can't demote the last owner - promote someone first." },
          { status: 400 }
        );
    }
    const { error } = await service.from('users').update({ role }).eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'remove') {
    if (userId === me.user_id)
      return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
    // Detach (now allowed by the relaxed CHECK constraint).
    const { error } = await service
      .from('users')
      .update({ firm_id: null, role: 'client' })
      .eq('id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await service
      .from('client_searches')
      .update({ realtor_id: null })
      .eq('realtor_id', userId)
      .eq('firm_id', me.firm_id);
    await service
      .from('client_searches')
      .update({ assigned_realtor_id: null })
      .eq('assigned_realtor_id', userId)
      .eq('firm_id', me.firm_id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
