import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST { date_id, done } - mark an important date complete or reopen it.
 * Staff only, scoped to their firm. Mirrors the web deadlineActions so mobile
 * has the same "mark done" control.
 */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.firm_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const staff = me.role && !['client', 'attorney'].includes(me.role);
  if (!staff) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dateId = String(body.date_id || '');
  const done = body.done !== false; // default to completing
  if (!dateId) return NextResponse.json({ error: 'Missing date.' }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('important_dates')
    .select('id, firm_id')
    .eq('id', dateId)
    .maybeSingle();
  if (!row || (row as any).firm_id !== me.firm_id)
    return NextResponse.json({ error: 'Date not found.' }, { status: 404 });

  const { error } = await service
    .from('important_dates')
    .update(
      done
        ? { completed_at: new Date().toISOString(), completed_by: me.user_id }
        : { completed_at: null, completed_by: null }
    )
    .eq('id', dateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, done });
}
