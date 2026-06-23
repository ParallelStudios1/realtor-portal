import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST { blocked_user_id, action: 'block' | 'unblock' }
 * Blocking hides that person's messages from you in both directions, and is a
 * required App Store / Play Store control for user-generated content.
 */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.user_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const blockedId = String(body.blocked_user_id || '');
  const action = String(body.action || 'block');
  if (!blockedId) return NextResponse.json({ error: 'Missing user.' }, { status: 400 });
  if (blockedId === me.user_id)
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  if (action === 'unblock') {
    const { error } = await service
      .from('user_blocks')
      .delete()
      .eq('blocker_id', me.user_id)
      .eq('blocked_id', blockedId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, blocked: false });
  }
  const { error } = await service
    .from('user_blocks')
    .upsert(
      { blocker_id: me.user_id, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, blocked: true });
}

/** GET -> list of user ids the caller has blocked. */
export async function GET(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.user_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const service = getSupabaseServiceRoleClient();
  const { data } = await service
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', me.user_id);
  return NextResponse.json({ blocked: (data || []).map((r: any) => r.blocked_id) });
}
