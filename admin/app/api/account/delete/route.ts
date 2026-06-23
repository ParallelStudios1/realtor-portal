import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST -> permanently delete the caller's own account.
 *
 * Apple requires apps that let users create an account to also let them
 * delete it from inside the app. Deleting the auth user cascades their
 * public.users row and their personal data (their own deals cascade; deals
 * where they were only the agent keep going with the realtor field nulled).
 *
 * Requires a confirm flag so it can't fire by accident.
 */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.user_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== true && body.confirm !== 'DELETE')
    return NextResponse.json({ error: 'Confirmation required.' }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  const { error } = await service.auth.admin.deleteUser(me.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
