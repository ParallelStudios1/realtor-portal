import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * HOUSE AGREEMENT — Bearer/cookie JSON API for the native mobile app.
 *
 * Mirrors markAgreedHouseAction / setAgreedHouseAction in
 *   admin/app/dashboard/clients/[id]/actions.ts
 * Sets the agreed home on the deal so either side sees it.
 *
 * POST /api/deals/[id]/agree-house  body { house_id }
 *   → { ok:true }  on success
 *   → { ok:false, error } with a clear message otherwise
 *
 * Authorize: caller is the principal client of the deal OR firm staff on the
 * deal's host firm. The house must belong to THIS deal's search_id.
 */

async function resolveCaller(req: Request): Promise<{
  user_id: string;
  firm_id: string | null;
  email: string | null;
  role: string | null;
} | null> {
  const me = await getMe();
  if (me?.user_id) {
    return {
      user_id: me.user_id,
      firm_id: me.firm_id ?? null,
      email: me.email ?? null,
      role: me.role ?? null,
    };
  }
  const authz = req.headers.get('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false },
    }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('users')
    .select('firm_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    user_id: data.user.id,
    firm_id: (row as any)?.firm_id ?? null,
    email: data.user.email ?? null,
    role: (row as any)?.role ?? null,
  };
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }

    const json = (await req.json().catch(() => ({}))) as { house_id?: string };
    const houseId = (json.house_id || '').trim();
    if (!houseId) {
      return NextResponse.json(
        { ok: false, error: 'Pick a house.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data: deal } = await service
      .from('client_searches')
      .select('id, firm_id, client_id')
      .eq('id', params.id)
      .maybeSingle();
    if (!deal) {
      return NextResponse.json(
        { ok: false, error: 'Deal not found.' },
        { status: 404 }
      );
    }
    const d = deal as { id: string; firm_id: string; client_id: string | null };

    // Authorize: principal client OR firm staff on the deal's host firm.
    const isPrincipalClient = d.client_id === me.user_id;
    const isStaffSameFirm =
      !!me.firm_id &&
      me.firm_id === d.firm_id &&
      ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'].includes(
        me.role || ''
      );
    if (!isPrincipalClient && !isStaffSameFirm) {
      return NextResponse.json(
        { ok: false, error: 'You do not have access to this deal.' },
        { status: 403 }
      );
    }

    // The house MUST be on THIS deal before agreeing to it.
    const { data: house } = await service
      .from('houses')
      .select('id, address, search_id')
      .eq('id', houseId)
      .eq('search_id', d.id)
      .maybeSingle();
    if (!house) {
      return NextResponse.json(
        { ok: false, error: 'That house is not on this deal.' },
        { status: 400 }
      );
    }

    const { error } = await service
      .from('client_searches')
      .update({
        offer_house_id: houseId,
        house_agreed_at: new Date().toISOString(),
        house_agreed_by: me.user_id,
      })
      .eq('id', d.id);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Activity row.
    try {
      await service.from('activities').insert({
        firm_id: d.firm_id,
        search_id: d.id,
        actor_id: me.user_id,
        action: 'house_agreed',
        target: (house as any).address || houseId,
        metadata: {
          house_id: houseId,
          by: isPrincipalClient ? 'client' : 'realtor',
        },
      });
    } catch (e: any) {
      console.error('[/api/deals/[id]/agree-house] activity failed', e?.message || e);
    }

    // Best-effort: notify the OTHER side that the agreed home is set. When the
    // client agreed, ping the realtor; when staff agreed, ping the client.
    try {
      const siteUrl =
        process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
      const addr = (house as any).address || 'the home';
      if (isPrincipalClient) {
        // Client agreed → notify the assigned realtor.
        const { data: ctx } = await service
          .from('client_searches')
          .select(
            `realtor:users!client_searches_realtor_id_fkey ( email, phone, full_name )`
          )
          .eq('id', d.id)
          .maybeSingle();
        const realtor = (ctx as any)?.realtor;
        const dealUrl = siteUrl + '/dashboard/deals/' + d.id;
        if (realtor?.email || realtor?.phone) {
          await notify({
            email: realtor?.email || null,
            phone: realtor?.phone || null,
            subject: 'Your client confirmed the home: ' + addr,
            text:
              'Your client confirmed the home for the deal:\n\n' +
              addr +
              '\n\nOpen the deal: ' +
              dealUrl,
            html: `<p>Your client confirmed the home for the deal:</p><p><strong>${escapeHtml(
              addr
            )}</strong></p><p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
            sms_text:
              'Your client confirmed the home: ' + addr + ' — ' + dealUrl,
          });
        }
      } else {
        // Staff agreed → notify the principal client.
        const { data: ctx } = await service
          .from('client_searches')
          .select(
            `client:users!client_searches_client_id_fkey ( email, phone, full_name )`
          )
          .eq('id', d.id)
          .maybeSingle();
        const client = (ctx as any)?.client;
        const homeUrl = siteUrl + '/client/houses/' + houseId;
        if (client?.email || client?.phone) {
          await notify({
            email: client?.email || null,
            phone: client?.phone || null,
            subject: 'Your agent confirmed the home: ' + addr,
            text:
              'Your agent confirmed the home for your deal:\n\n' +
              addr +
              '\n\nView it: ' +
              homeUrl,
            html: `<p>Your agent confirmed the home for your deal:</p><p><strong>${escapeHtml(
              addr
            )}</strong></p><p><a href="${homeUrl}">View it &rarr;</a></p>`,
            sms_text: 'Your agent confirmed the home: ' + addr + ' — ' + homeUrl,
          });
        }
      }
    } catch (e: any) {
      console.error('[/api/deals/[id]/agree-house] notify failed', e?.message || e);
    }

    // Push to the client side (best effort), mirroring setAgreedHouseAction.
    try {
      const base =
        process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
      await fetch(base + '/api/notifications/send-push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ searchId: d.id, kind: 'house_agreed' }),
      });
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/deals/[id]/agree-house]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
