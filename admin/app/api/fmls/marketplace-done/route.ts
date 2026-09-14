import { NextResponse } from 'next/server';
import { resolveCaller, isFirmAdmin } from '@/lib/bearerAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fmls/marketplace-done — the firm confirms they completed FMLS's
 * Marketplace self-subscribe step. Clears the in-app setup card.
 */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.firm_id) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!isFirmAdmin(me.role, me.firm_type)) {
    return NextResponse.json({ error: 'Firm admins only.' }, { status: 403 });
  }
  const service = getSupabaseServiceRoleClient();
  await service
    .from('firms')
    .update({ fmls_marketplace_done_at: new Date().toISOString() })
    .eq('id', me.firm_id);
  return NextResponse.json({ ok: true });
}
