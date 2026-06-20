import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { isFirmPlanActive } from '@/lib/planGate';
import { sendEmail, escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';

/**
 * POST /api/clients/invite
 * Body: { full_name, email, role_in_deal: 'buyer'|'seller' }
 *
 * Provisions the client's account (WITHOUT sending a Supabase magic-link
 * email), creates the public.users row, creates a client_searches row so
 * messages/houses/ratings have a parent, then emails the client OUR branded
 * invite whose CTA points at /invite/<token>. The token landing lets them
 * set a password and sign in - no Supabase auth email involved.
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
      'https://realtorportal.parallelstudios.co';

    // Provision the auth account WITHOUT sending Supabase's magic-link email.
    // We create the user directly (random password, email pre-confirmed); the
    // recipient sets their real password later on /invite/<token>. If they
    // already exist, we just resolve their id.
    let clientId: string | undefined;
    const { data: created, error: createErr } =
      await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password:
          'rp_' +
          Math.random().toString(36).slice(2) +
          Math.random().toString(36).slice(2),
        user_metadata: {
          full_name: fullName,
          firm_id: me.firm_id,
          role: 'client',
          role_in_deal: roleInDeal,
        },
      });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      return NextResponse.json({ error: createErr.message }, { status: 502 });
    }
    clientId = created?.user?.id;
    if (!clientId) {
      const { data: existingUser } = await service
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      clientId = existingUser?.id;
    }
    if (!clientId) {
      // Last resort: look it up in auth.users by listing (createUser said it
      // already exists but there's no public.users row yet).
      const { data: list } = await service.auth.admin.listUsers();
      clientId = list?.users?.find(
        (u) => u.email?.toLowerCase() === email
      )?.id;
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
      const { data: createdSearch, error: searchErr } = await service
        .from('client_searches')
        .insert({
          firm_id: me.firm_id,
          client_id: clientId,
          realtor_id: me.id,
          // Deal admin = the staffer inviting this client.
          created_by: me.id,
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
      searchId = createdSearch!.id;
    }

    // Branded invite via OUR /invite/<token> landing - NOT a Supabase email.
    // Create a deal_invites token (role = buyer/seller) and send the client a
    // Resend email whose CTA opens /invite/<token>, where they set a password
    // and sign in.
    let invitePath: string | null = null;
    const { data: inviteRow, error: inviteErr } = await service
      .from('deal_invites')
      .insert({
        search_id: searchId,
        firm_id: me.firm_id,
        role: roleInDeal, // 'buyer' | 'seller' → isClient branch on accept
        name: fullName,
        email,
        created_by: me.id,
      })
      .select('token')
      .single();
    if (inviteErr) {
      console.error('[clients/invite] deal_invites insert failed', inviteErr);
    } else if (inviteRow) {
      invitePath = '/invite/' + (inviteRow as any).token;
    }

    const inviteUrl = invitePath
      ? baseUrl + invitePath
      : baseUrl + '/login';
    if (invitePath) {
      // Resolve firm + realtor names for the email copy.
      const [{ data: firm }, { data: realtor }] = await Promise.all([
        service.from('firms').select('name').eq('id', me.firm_id).maybeSingle(),
        service
          .from('users')
          .select('full_name, email')
          .eq('id', me.id)
          .maybeSingle(),
      ]);
      const firmName = (firm as any)?.name || 'Realtor Portal';
      const realtorName =
        (realtor as any)?.full_name ||
        (realtor as any)?.email ||
        'Your agent';
      const safeName = escapeHtml(fullName);
      const safeFirm = escapeHtml(firmName);
      const safeRealtor = escapeHtml(realtorName);
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">Hi ${safeName},</p>
  <p style="margin:0 0 16px;">${safeRealtor} at <strong>${safeFirm}</strong> invited you to your ${roleInDeal === 'seller' ? 'home sale' : 'home search'} on Realtor Portal - where you'll track listings, tours, documents, and messages in one place.</p>
  <p style="margin:24px 0;">
    <a href="${inviteUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;">Set up your account &rarr;</a>
  </p>
  <p style="margin:24px 0 0;color:#475569;">- ${safeFirm}</p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">If the button above doesn't work, paste this link into your browser: ${inviteUrl}</p>
</div>`.trim();
      const text = [
        `Hi ${fullName},`,
        '',
        `${realtorName} at ${firmName} invited you to your ${roleInDeal === 'seller' ? 'home sale' : 'home search'} on Realtor Portal.`,
        '',
        `Set up your account: ${inviteUrl}`,
        '',
        `- ${firmName}`,
      ].join('\n');
      await sendEmail({
        to: email,
        subject: `${realtorName} invited you to ${firmName} on Realtor Portal`,
        html,
        text,
        replyTo: (realtor as any)?.email || undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      client_id: clientId,
      search_id: searchId,
      invite_url: inviteUrl,
    });
  } catch (err: any) {
    console.error('[clients/invite] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
