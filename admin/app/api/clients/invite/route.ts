import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { isFirmPlanActive } from '@/lib/planGate';

export const runtime = 'nodejs';

/**
 * POST /api/clients/invite
 * Body: { full_name, email, role_in_deal: 'buyer'|'seller' }
 *
 * Sends a Supabase magic-link invite, creates the public.users row, and
 * creates a client_searches row so messages/houses/ratings have a parent.
 *
 * Auth: cookie session (web) or Authorization: Bearer (mobile).
 *
 * Always returns JSON.
 */
async function resolveCaller(req: Request) {
  const me = await getMe();
  if (me?.user_id) return { id: me.user_id, firm_id: me.firm_id, role: me.role };
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
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
  const { data: row } = await sb
    .from('users')
    .select('firm_id, role')
    .eq('id', data.user.id)
    .single();
  return {
    id: data.user.id,
    firm_id: (row?.firm_id as string) || null,
    role: (row?.role as string) || null,
  };
}

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    if (me.role && me.role !== 'realtor' && me.role !== 'firm_admin') {
      return NextResponse.json(
        { error: 'Only realtors can invite clients.' },
        { status: 403 }
      );
    }
    if (!(await isFirmPlanActive(me.firm_id))) {
      return NextResponse.json(
        {
          error:
            'Your free trial has ended. Pick a plan to invite more clients.',
          code: 'plan_inactive',
        },
        { status: 402 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      full_name?: string;
      email?: string;
      role_in_deal?: 'buyer' | 'seller';
    };

    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const roleInDeal = body.role_in_deal === 'seller' ? 'seller' : 'buyer';

    if (!fullName || !email) {
      return NextResponse.json(
        { error: 'Name and email are required.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      'https://realtor-portal-ten.vercel.app';
    const redirectTo = `${baseUrl}/welcome?firm_id=${me.firm_id}`;

    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        firm_id: me.firm_id,
        role: 'client',
        role_in_deal: roleInDeal,
      },
      redirectTo,
    });
    if (error) {
      // If they already exist, fall through to upsert + search creation
      // rather than erroring. inviteUserByEmail returns "User already
      // registered" for duplicates.
      if (!/already/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 502 });
      }
    }

    // Resolve the user id for follow-up rows
    let clientId = data?.user?.id;
    if (!clientId) {
      const { data: existingUser } = await service
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      clientId = existingUser?.id;
    }
    if (!clientId) {
      return NextResponse.json(
        { error: 'Could not resolve user id after invite.' },
        { status: 500 }
      );
    }

    // public.users row
    await service.from('users').upsert(
      {
        id: clientId,
        firm_id: me.firm_id,
        email,
        full_name: fullName,
        role: 'client',
      },
      { onConflict: 'id' }
    );

    // client_searches row (one per client per firm)
    const { data: existingSearch } = await service
      .from('client_searches')
      .select('id')
      .eq('client_id', clientId)
      .eq('firm_id', me.firm_id)
      .maybeSingle();

    let searchId = existingSearch?.id as string | undefined;
    if (!searchId) {
      const { data: created, error: searchErr } = await service
        .from('client_searches')
        .insert({
          firm_id: me.firm_id,
          client_id: clientId,
          realtor_id: me.id,
          name:
            fullName + (roleInDeal === 'seller' ? "'s Listing" : "'s Search"),
          phase: 'searching',
          kind: roleInDeal,
        })
        .select('id')
        .single();
      if (searchErr) {
        return NextResponse.json(
          { error: 'Search row failed: ' + searchErr.message },
          { status: 500 }
        );
      }
      searchId = created!.id;
    }

    return NextResponse.json({
      ok: true,
      client_id: clientId,
      search_id: searchId,
    });
  } catch (err: any) {
    console.error('[clients/invite] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
