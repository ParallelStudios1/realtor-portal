import { NextResponse } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Returns the count of "new since X" items across the firm - used to decorate
 * the Inbox nav tab with a red badge. X defaults to last 24h.
 */
export async function GET(req: Request) {
  const me = await getMe();
  if (!me?.firm_id) return NextResponse.json({ count: 0 });
  const url = new URL(req.url);
  const sinceHours = Math.max(1, Math.min(168, Number(url.searchParams.get('h')) || 24));
  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const service = getSupabaseServiceRoleClient();
  const [a, m, t, d] = await Promise.all([
    service.from('activities').select('id', { count: 'exact', head: true }).eq('firm_id', me.firm_id).gte('created_at', since),
    service.from('messages').select('id', { count: 'exact', head: true }).eq('firm_id', me.firm_id).gte('created_at', since).neq('sender_id', me.user_id),
    service.from('tour_requests').select('id', { count: 'exact', head: true }).eq('firm_id', me.firm_id).gte('created_at', since),
    service.from('documents').select('id', { count: 'exact', head: true }).eq('firm_id', me.firm_id).gte('created_at', since),
  ]);
  const count = (a.count || 0) + (m.count || 0) + (t.count || 0) + (d.count || 0);
  return NextResponse.json({ count });
}
