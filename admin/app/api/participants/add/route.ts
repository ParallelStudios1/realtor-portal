import { NextResponse } from 'next/server';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notify } from '@/lib/notify';
import { canUsePremiumForDeal } from '@/lib/planGate';
import { escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/participants/add
 *
 * Mobile-friendly wrapper around the same Add Party logic as the
 * server-action addParticipantAction(). Same auth (cookie session OR
 * Bearer token from mobile), same SMS-first invite flow, same magic-link
 * generation for cross-firm realtors.
 *
 * Body:
 *   {
 *     search_id: uuid,           // the deal
 *     role: PartyRole,
 *     name?, email?, phone?,
 *     can_view_documents?, can_view_financials?,
 *     can_view_messages?, can_view_dates?
 *   }
 *
 * Response:
 *   { ok: true, participant: <row>, notify: { email, sms } }
 *
 * Why a separate route from the server action: the action lives at
 * /dashboard/clients/[id]/actions.ts and is called via React server-action
 * RPC — that doesn't work from the mobile app, which is a plain HTTPS
 * client. This endpoint accepts JSON + Bearer tokens.
 */
export async function POST(req: Request) {
  try {
    const me = await getMe();
    if (!me?.firm_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    if (
      me.role !== 'realtor' &&
      me.role !== 'firm_admin' &&
      me.role !== 'super_admin' &&
      me.role !== 'owner' &&
      me.role !== 'manager'
    ) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden.' },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      search_id?: string;
      role?: string;
      name?: string;
      email?: string;
      phone?: string;
      represents?: 'buyer' | 'seller';
      can_view_documents?: boolean;
      can_view_financials?: boolean;
      can_view_messages?: boolean;
      can_view_dates?: boolean;
    };

    if (!body.search_id || !body.role) {
      return NextResponse.json(
        { ok: false, error: 'search_id and role are required.' },
        { status: 400 }
      );
    }
    if (!body.name && !body.email && !body.phone) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Give me a name, phone, or email so we can identify them.',
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data: search } = await supabase
      .from('client_searches')
      .select('id, firm_id, client_id, realtor_id, phase')
      .eq('id', body.search_id)
      .maybeSingle();
    if (!search) {
      return NextResponse.json(
        { ok: false, error: 'Deal not found.' },
        { status: 404 }
      );
    }

    // ACCESS: caller must be (a) staff in the deal's host firm, OR
    // (b) a participating realtor on the deal (cross-firm collab), OR
    // (c) the deal's principal client. Otherwise reject — without this
    // check, a knowledgeable caller could POST any search_id they once
    // had visibility to and add participants there.
    const service = getSupabaseServiceRoleClient();
    const callerIsInHostFirm = (search as any).firm_id === me.firm_id;
    let allowed = callerIsInHostFirm;
    if (!allowed) {
      const { data: parts } = await service
        .from('deal_participants')
        .select('id, role')
        .eq('search_id', (search as any).id)
        .or(
          [
            'user_id.eq.' + me.user_id,
            me.email ? 'external_email.eq.' + me.email.toLowerCase() : null,
          ]
            .filter(Boolean)
            .join(',')
        )
        .in('role', ['realtor', 'co_realtor']);
      allowed =
        (parts && parts.length > 0) ||
        (search as any).client_id === me.user_id;
    }
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: 'Not allowed on this deal.' },
        { status: 403 }
      );
    }

    const planOk = await canUsePremiumForDeal(
      me.firm_id,
      (search as any).id,
      me.email,
      me.user_id
    );
    if (!planOk) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Your free trial has ended. Pick a plan in Settings → Billing.',
        },
        { status: 402 }
      );
    }

    // Resolve a matching firm user (so the auth.uid path of the cross-firm
    // RLS function works once they sign in) and their phone-on-file.
    let userId: string | null = null;
    let userPhone: string | null = null;
    if (body.email) {
      const { data: u } = await service
        .from('users')
        .select('id, phone')
        .ilike('email', body.email)
        .maybeSingle();
      userId = (u as any)?.id ?? null;
      userPhone = (u as any)?.phone ?? null;
    }

    // `represents` (buyer-side / seller-side) only applies to co-realtors.
    // NULL it for any other role and reject an out-of-range value.
    const represents =
      body.role === 'co_realtor' &&
      (body.represents === 'buyer' || body.represents === 'seller')
        ? body.represents
        : null;

    const { data: inserted, error } = await service
      .from('deal_participants')
      .insert({
        search_id: (search as any).id,
        firm_id: (search as any).firm_id,
        user_id: userId,
        external_email: body.email || null,
        external_name: body.name || null,
        external_phone: body.phone || null,
        role: body.role,
        represents,
        can_view_documents: body.can_view_documents ?? true,
        can_view_financials: body.can_view_financials ?? false,
        can_view_messages: body.can_view_messages ?? false,
        can_view_dates: body.can_view_dates ?? true,
        created_by: me.user_id,
      })
      .select(
        'id, role, represents, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
      )
      .single();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Activity row
    await service.from('activities').insert({
      firm_id: (search as any).firm_id,
      search_id: (search as any).id,
      actor_id: me.user_id,
      action: body.role + '_added',
      target: body.name || body.email || '',
    });

    // FIRST-CLASS INVITE TOKEN.
    // Mirrors addParticipantAction(): write a deal_invites row and use the
    // returned token to build a /invite/<token> landing URL. That URL is
    // unauthenticated, branded, and role-aware — it replaces the fragile
    // Supabase magic-link flow that used to dump recipients on /welcome
    // (and on /login when the hash never made it server-side).
    let invitePath: string | null = null;
    if (body.email || body.phone) {
      try {
        const { data: inviteRow, error: inviteErr } = await service
          .from('deal_invites')
          .insert({
            search_id: (search as any).id,
            firm_id: (search as any).firm_id,
            participant_id: (inserted as any).id,
            role: body.role,
            name: body.name || null,
            email: body.email ? body.email.toLowerCase() : null,
            phone: body.phone || null,
            created_by: me.user_id,
          })
          .select('token')
          .single();
        if (inviteErr) {
          console.error(
            '[/api/participants/add] deal_invites insert error',
            {
              code: (inviteErr as any).code,
              message: inviteErr.message,
              details: (inviteErr as any).details,
              hint: (inviteErr as any).hint,
            }
          );
        } else if (inviteRow) {
          invitePath = '/invite/' + (inviteRow as any).token;
          console.log(
            '[/api/participants/add] deal_invites inserted ok',
            { token: (inviteRow as any).token, role: body.role }
          );
        }
      } catch (e: any) {
        console.error(
          '[/api/participants/add] deal_invites insert threw',
          e?.message || e,
          e?.stack
        );
      }
    }

    // Resolve context + SMS body, then fire notify. The primary URL is
    // always the /invite/<token> landing when we have one; magic-link +
    // signup are only used as a fallback if the deal_invites insert
    // failed (so the recipient still gets *something* clickable).
    let notifyResult: any = null;
    let inviteUrl: string | null = invitePath
      ? (process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app') +
        invitePath
      : null;
    if (body.email || body.phone || userPhone) {
      try {
        const { data: ctx } = await service
          .from('client_searches')
          .select(
            `name, firm:firms ( name ), realtor:users!client_searches_realtor_id_fkey ( full_name, email, phone )`
          )
          .eq('id', (search as any).id)
          .maybeSingle();
        const firmName = (ctx as any)?.firm?.name || 'a Realtor Portal firm';
        const realtorName =
          (ctx as any)?.realtor?.full_name ||
          (ctx as any)?.realtor?.email ||
          'Your realtor';
        const siteUrl =
          process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
        const isRealtorRole =
          body.role === 'realtor' || body.role === 'co_realtor';
        const signupUrl =
          siteUrl +
          '/signup?role=realtor' +
          (body.email ? '&email=' + encodeURIComponent(body.email) : '') +
          '&next=' +
          encodeURIComponent('/deal/' + (search as any).id);

        // The /invite/<token> landing is ALWAYS the primary URL when we
        // have one. We never generate a Supabase magic link here — that
        // would send Supabase's own auth email instead of our branded one.
        // The /signup URL is only a fallback for the rare case where the
        // deal_invites insert failed.
        const primaryUrl = invitePath ? siteUrl + invitePath : signupUrl;
        // Keep the outer inviteUrl in sync (it was set from invitePath
        // above, but on the magicLink/signup fallback paths we want the
        // mobile app to receive *something* it can copy to clipboard).
        inviteUrl = primaryUrl;
        const rolePretty = body.role.replace(/_/g, ' ');
        const safeRealtor = escapeHtml(realtorName);
        const safeFirm = escapeHtml(firmName);
        const safeRole = escapeHtml(rolePretty);
        const subject = isRealtorRole
          ? `${realtorName} invited you to co-broker a deal at ${firmName}`
          : `${realtorName} added you to a real-estate deal at ${firmName}`;

        const realtorBody = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
            <h2 style="font-size:20px;margin:0 0 12px">You've been invited to co-broker a deal</h2>
            <p>${safeRealtor} at <strong>${safeFirm}</strong> added you as <strong>${safeRole}</strong>.</p>
            <p style="margin:24px 0">
              <a href="${primaryUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Open the deal &rarr;</a>
            </p>
            <p style="color:#94A3B8;font-size:12px">If the button above doesn't work, paste this link into your browser: ${primaryUrl}</p>
          </div>`;
        const partyBody = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
            <h2 style="font-size:20px;margin:0 0 12px">You've been added to a deal</h2>
            <p>${safeRealtor} at <strong>${safeFirm}</strong> added you to a deal as <strong>${safeRole}</strong>.</p>
            <p style="margin:24px 0">
              <a href="${primaryUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Accept invite &amp; open the deal &rarr;</a>
            </p>
            <p style="color:#94A3B8;font-size:12px">If the button above doesn't work, paste this link into your browser: ${primaryUrl}</p>
          </div>`;
        const realtorText =
          `${realtorName} (${firmName}) invited you to co-broker a deal as ${rolePretty}.\n\nTap to open: ${primaryUrl}`;
        const partyText =
          `${realtorName} (${firmName}) added you to a real-estate deal as ${rolePretty}.\n\nTap to accept: ${primaryUrl}`;
        // Compact SMS body — ALWAYS uses primaryUrl (the /invite/<token>
        // landing). The deal URL requires auth and dumps un-authenticated
        // visitors on /login.
        const smsBody = isRealtorRole
          ? `${realtorName} (${firmName}) invited you to co-broker a deal on Realtor Portal. Tap to open: ${primaryUrl}`
          : `${realtorName} (${firmName}) added you to a real-estate deal as ${rolePretty}. Tap to accept: ${primaryUrl}`;

        notifyResult = await notify({
          email: body.email || null,
          phone: body.phone || userPhone,
          subject,
          text: isRealtorRole ? realtorText : partyText,
          html: isRealtorRole ? realtorBody : partyBody,
          sms_text: smsBody,
        });
      } catch (e: any) {
        console.error(
          '[/api/participants/add] notify failed',
          e?.message || e
        );
      }
    }

    return NextResponse.json({
      ok: true,
      participant: inserted,
      notify: notifyResult,
      // Surfaced for the mobile app's copy-to-clipboard fallback when
      // email/SMS don't reach the recipient (Twilio still in verification,
      // Supabase SMTP throttled, etc.). Mirrors `invite_url` returned by
      // the addParticipantAction server action.
      invite_url: inviteUrl,
    });
  } catch (err: any) {
    console.error('[/api/participants/add]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
