import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/bearerAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { isFirmPlanActive } from '@/lib/planGate';
import { defaultPartyPermissions } from '@/lib/partyPermissions';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/attorney/deals — attorney-led deal creation for the MOBILE app.
 *
 * The JSON twin of the web's createAttorneyDealAction: the attorney's client
 * is usually the REALTOR who sent them the file, and the realtor brings their
 * buyer or seller. Same shape here.
 *
 * Body:
 *   {
 *     name: string,
 *     kind: 'buyer' | 'seller',
 *     phase?: 'searching' | 'under_contract' | 'closing',
 *     address?: string,
 *     realtor?:   { name?: string, email?: string },
 *     principal?: { name?: string, email?: string },   // the buyer/seller
 *     others?:    Array<{ role: string, name?: string, email?: string }>
 *   }
 *
 * Auth: cookie session or Bearer token. Caller must be an attorney whose own
 * firm is a law practice with a live plan/trial.
 */

const INVITABLE = new Set([
  'realtor',
  'co_realtor',
  'buyer',
  'seller',
  'lender',
  'inspector',
  'title_agent',
  'other',
]);

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id || !me.firm_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    if (me.role !== 'attorney' || me.firm_type !== 'law_firm') {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Only attorneys with their own practice can start attorney-led deals.',
        },
        { status: 403 }
      );
    }
    if (!(await isFirmPlanActive(me.firm_id))) {
      return NextResponse.json(
        { ok: false, error: 'Your trial has ended. Pick a plan to start new deals.' },
        { status: 402 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const name = String(body.name || '').trim();
    const kind = String(body.kind || 'buyer');
    const phase = String(body.phase || 'searching');
    const address = String(body.address || '').trim();

    if (!name)
      return NextResponse.json(
        { ok: false, error: 'Give the deal a name.' },
        { status: 400 }
      );
    if (!['buyer', 'seller'].includes(kind))
      return NextResponse.json(
        { ok: false, error: 'kind must be buyer or seller.' },
        { status: 400 }
      );
    if (!['searching', 'under_contract', 'closing'].includes(phase))
      return NextResponse.json(
        { ok: false, error: 'Invalid starting phase.' },
        { status: 400 }
      );

    // Normalize parties: referring realtor, the principal, extras.
    type P = { role: string; name: string; email: string };
    const parties: P[] = [];
    const push = (role: string, n: any, e: any) => {
      const pname = String(n || '').trim();
      const email = String(e || '').trim().toLowerCase();
      if (!pname && !email) return null;
      if (!INVITABLE.has(role)) return `"${role}" is not an invitable role.`;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return `A valid email is required for the ${role.replace('_', ' ')}.`;
      if (!parties.some((p) => p.email === email))
        parties.push({ role, name: pname, email });
      return null;
    };
    let err =
      push('realtor', body.realtor?.name, body.realtor?.email) ||
      push(kind === 'seller' ? 'seller' : 'buyer', body.principal?.name, body.principal?.email);
    for (const o of Array.isArray(body.others) ? body.others : []) {
      err = err || push(String(o?.role || 'other'), o?.name, o?.email);
    }
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });

    const service = getSupabaseServiceRoleClient();
    const { data: firm } = await service
      .from('firms')
      .select('name')
      .eq('id', me.firm_id)
      .maybeSingle();
    const firmName = (firm as any)?.name || 'a law practice';

    // Look up the caller's display name once for invite copy + attorney stamp.
    const { data: meRow } = await service
      .from('users')
      .select('full_name')
      .eq('id', me.user_id)
      .maybeSingle();
    const attorneyName =
      (meRow as any)?.full_name || me.email || 'Your attorney';

    const { data: deal, error: dealErr } = await service
      .from('client_searches')
      .insert({
        firm_id: me.firm_id,
        name,
        kind,
        phase,
        orchestrated_by: 'attorney',
        created_by: me.user_id,
        attorney_name: attorneyName,
        attorney_email: (me.email || '').toLowerCase() || null,
      })
      .select('id')
      .single();
    if (dealErr || !deal)
      return NextResponse.json(
        { ok: false, error: dealErr?.message || 'Deal insert failed.' },
        { status: 500 }
      );
    const dealId = (deal as any).id as string;

    if (address) {
      await service
        .from('houses')
        .insert({ firm_id: me.firm_id, search_id: dealId, address });
    }

    // The attorney themself, full visibility — also how the dashboards find it.
    await service.from('deal_participants').insert({
      search_id: dealId,
      firm_id: me.firm_id,
      user_id: me.user_id,
      external_email: (me.email || '').toLowerCase() || null,
      external_name: attorneyName,
      role: 'attorney',
      can_view_documents: true,
      can_view_financials: true,
      can_view_messages: true,
      can_view_dates: true,
      created_by: me.user_id,
    });

    await service.from('activities').insert({
      firm_id: me.firm_id,
      search_id: dealId,
      actor_id: me.user_id,
      action: 'deal_created',
      target: name,
      metadata: { orchestrated_by: 'attorney', via: 'mobile' },
    });

    const siteUrl =
      process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
    const invited: string[] = [];

    for (const p of parties) {
      const { data: existingUser } = await service
        .from('users')
        .select('id')
        .ilike('email', p.email)
        .maybeSingle();
      const perms = defaultPartyPermissions(p.role);
      const { data: participant, error: partErr } = await service
        .from('deal_participants')
        .insert({
          search_id: dealId,
          firm_id: me.firm_id,
          user_id: (existingUser as any)?.id ?? null,
          external_email: p.email,
          external_name: p.name || null,
          role: p.role,
          can_view_documents: perms.can_view_documents,
          can_view_financials: perms.can_view_financials,
          can_view_messages: perms.can_view_messages,
          can_view_dates: perms.can_view_dates,
          created_by: me.user_id,
        })
        .select('id')
        .single();
      if (partErr) continue;

      let inviteUrl = siteUrl + '/deal/' + dealId;
      try {
        const { data: inviteRow } = await service
          .from('deal_invites')
          .insert({
            search_id: dealId,
            firm_id: me.firm_id,
            participant_id: (participant as any).id,
            role: p.role,
            name: p.name || null,
            email: p.email,
            created_by: me.user_id,
          })
          .select('token')
          .single();
        if (inviteRow) inviteUrl = siteUrl + '/invite/' + (inviteRow as any).token;
      } catch {}

      const rolePretty = p.role.replace(/_/g, ' ');
      try {
        await notify({
          email: p.email,
          subject: `${attorneyName} added you to a real-estate deal`,
          html: `
            <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
              <h2 style="font-size:20px;margin:0 0 12px">You've been added to a deal</h2>
              <p>${escapeHtml(attorneyName)} at <strong>${escapeHtml(firmName)}</strong> is coordinating <strong>${escapeHtml(name)}</strong> and added you as <strong>${escapeHtml(rolePretty)}</strong>.</p>
              <p style="margin:24px 0"><a href="${inviteUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Accept invite &amp; open the deal &rarr;</a></p>
              <p style="color:#94A3B8;font-size:12px">If the button doesn't work, paste this link into your browser: ${inviteUrl}</p>
            </div>`,
          text: `${attorneyName} (${firmName}) added you to the deal "${name}" as ${rolePretty}.\n\nOpen it: ${inviteUrl}`,
        });
      } catch {}
      invited.push(p.email);
    }

    return NextResponse.json({ ok: true, deal_id: dealId, invited });
  } catch (e: any) {
    console.error('[/api/attorney/deals]', e?.message || e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
