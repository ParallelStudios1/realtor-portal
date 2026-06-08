'use server';

import { revalidatePath } from 'next/cache';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { emailEveryoneOnPhaseChange } from '@/lib/dealEmail';
import { isFirmPlanActive, canUsePremiumForDeal } from '@/lib/planGate';
import { notify, notifyDealParticipants } from '@/lib/notify';
import { defaultPartyPermissions } from '@/lib/partyPermissions';

/**
 * Server actions called from the rich realtor client-detail page. Each one
 * verifies that the caller is a realtor in the same firm as the client
 * before writing, then invalidates the page on success.
 *
 * Conventions:
 *   - Returns { ok: true } on success.
 *   - Returns { ok: false, error: string } on failure (UI shows toast).
 *   - Every write also inserts an `activities` row so the timeline updates.
 */

async function authorize(idOrSearchId: string) {
  const me = await getMe();
  if (!me?.firm_id) return { error: 'Not authenticated.' as const };
  if (
    me.role !== 'realtor' &&
    me.role !== 'firm_admin' &&
    me.role !== 'super_admin' &&
    me.role !== 'owner' &&
    me.role !== 'manager'
  )
    return { error: 'Forbidden.' as const };
  const supabase = getSupabaseServerClient();
  // The action grid lives on both the legacy /dashboard/clients/[id] page
  // (passes a public.users.id) and the new /dashboard/deals/[id] page
  // (which falls back to the search id when the deal has no principal
  // client yet). Resolve either: try client_id first, then search id.
  //
  // We don't pre-filter by firm_id here. The query runs as the caller's
  // user, so RLS already enforces visibility — and that includes the
  // cross-firm collab path (can_collab_on_search) that lets an invited
  // realtor from another firm operate on the deal they've been added to.
  // Pre-filtering by firm_id would short-circuit that and 404 every
  // cross-firm action.
  let { data: search } = await supabase
    .from('client_searches')
    .select('id, firm_id, client_id, realtor_id, phase, closing_amount')
    .eq('client_id', idOrSearchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!search) {
    const fallback = await supabase
      .from('client_searches')
      .select('id, firm_id, client_id, realtor_id, phase, closing_amount')
      .eq('id', idOrSearchId)
      .maybeSingle();
    search = fallback.data;
  }
  if (!search) return { error: 'No deal found.' as const };
  // Plan gate: use the per-deal helper so a paying host firm's plan covers
  // their invited cross-firm collaborators on this specific deal, even if
  // the collaborator's home firm is on the free plan. Their own firm still
  // pays for everything else they do outside of guest deals.
  const planOk = await canUsePremiumForDeal(
    me.firm_id,
    (search as any).id,
    me.email,
    me.user_id
  );
  if (!planOk)
    return {
      error:
        'Your free trial has ended. Pick a plan in Settings → Billing to continue.' as const,
    };
  return { me, search };
}

async function activity(
  searchId: string,
  firmId: string,
  actorId: string,
  action: string,
  target: string,
  metadata?: any
) {
  const service = getSupabaseServiceRoleClient();
  await service.from('activities').insert({
    firm_id: firmId,
    search_id: searchId,
    actor_id: actorId,
    action,
    target,
    metadata: metadata ?? null,
  });
}

const PHASE_CELEBRATIONS: Record<string, string> = {
  offer_made:
    '🎯 Offer is in! Your agent has submitted your offer. Fingers crossed.',
  counter_offer:
    '↩️ Counter offer phase — your agent is negotiating. Hang tight.',
  under_contract:
    '🎉 Congrats — you are UNDER CONTRACT! Big step. Your agent will line up inspection and appraisal next.',
  closing:
    '🏁 You are in the closing phase. Wire instructions and final paperwork are coming.',
  closed:
    '🏡 CONGRATS! The house is officially yours. Welcome home.',
};

export async function updatePhaseAction(
  clientId: string,
  phase:
    | 'searching'
    | 'offer_made'
    | 'counter_offer'
    | 'under_contract'
    | 'closing'
    | 'closed',
  extras?: {
    offer_amount?: number | null;
    counter_offer_amount?: number | null;
    closing_amount?: number | null;
    closing_date?: string | null;
    closed_message?: string | null;
    contract_url?: string | null;
    docusign_envelope_url?: string | null;
    offer_house_id?: string | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const previousPhase = a.search.phase;

  // -- PHASE-CHANGE REQUIRED INFO --------------------------------------------
  // Certain target phases require the relevant deal fields to be supplied (or
  // already present on the deal). We validate server-side so the deal can never
  // land in a phase that's missing the data that phase implies. `searching`
  // has no requirements; `under_contract` is handled by goUnderContractAction
  // (house + dates + seller) and we redirect callers there.
  if (phase !== previousPhase) {
    if (phase === 'offer_made') {
      if (extras?.offer_amount == null || !(Number(extras.offer_amount) > 0))
        return {
          ok: false as const,
          error: 'An offer amount is required to move to Offer made.',
        };
      if (!extras?.offer_house_id)
        return {
          ok: false as const,
          error: 'Pick which house the offer is on to move to Offer made.',
        };
    }
    if (phase === 'counter_offer') {
      if (
        extras?.counter_offer_amount == null ||
        !(Number(extras.counter_offer_amount) > 0)
      )
        return {
          ok: false as const,
          error: 'A counter-offer amount is required to move to Counter offer.',
        };
    }
    if (phase === 'under_contract') {
      // Under contract is captured by the dedicated goUnderContractAction so the
      // house + key dates + seller-side parties are all set together.
      return {
        ok: false as const,
        error:
          'Use "Go under contract" to move into Under contract — it captures the house, dates, and seller.',
      };
    }
    if (phase === 'closing') {
      if (!extras?.closing_date)
        return {
          ok: false as const,
          error: 'A closing date is required to move to Closing.',
        };
      if (extras?.closing_amount == null || !(Number(extras.closing_amount) > 0))
        return {
          ok: false as const,
          error: 'A closing amount is required to move to Closing.',
        };
    }
    if (phase === 'closed') {
      // Final closing amount required; fall back to any amount already on the
      // deal so a realtor who set it during Closing isn't forced to re-enter it.
      const finalAmount =
        extras?.closing_amount ?? (a.search as any).closing_amount ?? null;
      if (finalAmount == null || !(Number(finalAmount) > 0))
        return {
          ok: false as const,
          error: 'A final closing amount is required to mark the deal Closed.',
        };
    }
  }

  // Build update payload — include any phase-specific extras the modal collected.
  const updates: Record<string, any> = { phase };
  if (extras?.offer_amount != null) updates.offer_amount = extras.offer_amount;
  if (extras?.closing_amount != null) updates.closing_amount = extras.closing_amount;
  if (extras?.counter_offer_amount != null)
    updates.counter_offer_amount = extras.counter_offer_amount;
  if (extras?.closing_date) updates.closing_date = extras.closing_date;
  if (extras?.closed_message) updates.closed_message = extras.closed_message;
  if (extras?.contract_url) updates.contract_url = extras.contract_url;
  if (extras?.docusign_envelope_url)
    updates.docusign_envelope_url = extras.docusign_envelope_url;
  if (extras?.offer_house_id) updates.offer_house_id = extras.offer_house_id;
  const { error } = await service
    .from('client_searches')
    .update(updates)
    .eq('id', a.search.id);
  if (error) return { ok: false as const, error: error.message };
  await activity(a.search.id, a.search.firm_id, a.me.user_id, 'phase_change', phase, extras);
  // Auto-add the closing date as an important_dates row when we get one.
  if (extras?.closing_date) {
    await service.from('important_dates').upsert(
      {
        firm_id: a.search.firm_id,
        search_id: a.search.id,
        label: 'Closing day',
        date: extras.closing_date,
        created_by: a.me.user_id,
      },
      { onConflict: 'search_id,label' as any, ignoreDuplicates: false }
    );
  }

  // Auto-celebrate transitions to milestone phases.
  if (phase !== previousPhase && PHASE_CELEBRATIONS[phase]) {
    await service.from('messages').insert({
      firm_id: a.search.firm_id,
      search_id: a.search.id,
      sender_id: a.me.user_id,
      body: PHASE_CELEBRATIONS[phase],
    });
    // Push to the client side (best effort).
    try {
      const base = process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
      await fetch(base + '/api/notifications/send-push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId: a.search.id,
          kind: 'phase_change',
        }),
      });
    } catch {}
    // Email every party on the deal (client, realtor, attorney, all participants).
    try {
      await emailEveryoneOnPhaseChange({
        searchId: a.search.id,
        newPhase: phase,
      });
    } catch {}
    // SMS milestone announcement — short, punchy, links to the deal.
    try {
      const siteUrl =
        process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
      const dealUrl = siteUrl + '/deal/' + a.search.id;
      const phaseLabel = phase.replace(/_/g, ' ');
      await notifyDealParticipants({
        searchId: a.search.id,
        subject: `Deal milestone: ${phaseLabel}`,
        text: PHASE_CELEBRATIONS[phase] + '\n\nOpen the deal: ' + dealUrl,
        html: `<p>${escapeHtml(PHASE_CELEBRATIONS[phase])}</p><p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
        sms_text: PHASE_CELEBRATIONS[phase] + ' — ' + dealUrl,
        excludeUserId: a.me.user_id,
      });
    } catch (e: any) {
      console.error('[updatePhaseAction] notify failed', e?.message || e);
    }
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function addImportantDateAction(
  clientId: string,
  payload: {
    label: string;
    date: string;
    kind?: string;
    event_time?: string | null;
    location?: string | null;
    things_to_bring?: string | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.label || !payload.date)
    return { ok: false as const, error: 'Label and date are required.' };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service.from('important_dates').insert({
    firm_id: a.search.firm_id,
    search_id: a.search.id,
    label: payload.label,
    date: payload.date,
    event_time: payload.event_time || null,
    location: payload.location?.trim() || null,
    things_to_bring: payload.things_to_bring?.trim() || null,
    notes: payload.kind && payload.kind !== 'custom' ? payload.kind : null,
    created_by: a.me.user_id,
  });
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'important_date_added',
    payload.label,
    { date: payload.date, kind: payload.kind }
  );
  // Email + SMS everyone about the new date so it lands in their calendar.
  try {
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + a.search.id;
    const pretty =
      payload.label +
      ' — ' +
      new Date(payload.date + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) +
      (payload.event_time ? ' @ ' + payload.event_time : '');
    const extras =
      (payload.location ? '\nLocation: ' + payload.location : '') +
      (payload.things_to_bring
        ? '\nBring: ' + payload.things_to_bring
        : '');
    await notifyDealParticipants({
      searchId: a.search.id,
      subject: 'New date on your deal: ' + payload.label,
      text: 'A new date was added to your deal:\n\n' + pretty + extras + '\n\nOpen the deal: ' + dealUrl,
      html: `<p><strong>New date on your deal:</strong></p><p>${escapeHtml(pretty)}</p>${
        payload.location ? `<p><strong>Location:</strong> ${escapeHtml(payload.location)}</p>` : ''
      }${
        payload.things_to_bring ? `<p><strong>Bring:</strong> ${escapeHtml(payload.things_to_bring)}</p>` : ''
      }<p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
      sms_text: pretty + (payload.location ? ' @ ' + payload.location : '') + ' — ' + dealUrl,
      excludeUserId: a.me.user_id,
    });
  } catch (e: any) {
    console.error('[addImportantDateAction] notify failed', e?.message || e);
  }
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function addHouseAction(
  clientId: string,
  payload: {
    address: string;
    list_price?: number | null;
    listing_url?: string | null;
    photo_url?: string | null;
    notes?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    square_feet?: number | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.address)
    return { ok: false as const, error: 'Address is required.' };
  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from('houses')
    .insert({
      firm_id: a.search.firm_id,
      search_id: a.search.id,
      address: payload.address,
      list_price: payload.list_price ?? null,
      listing_url: payload.listing_url ?? null,
      photo_url: payload.photo_url ?? null,
      notes: payload.notes ?? null,
      bedrooms: payload.bedrooms ?? null,
      bathrooms: payload.bathrooms ?? null,
      square_feet: payload.square_feet ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'house_added',
    payload.address,
    { houseId: data?.id, list_price: payload.list_price }
  );
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const, houseId: data?.id };
}

export async function linkDocusignAction(clientId: string, url: string) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!/^https?:\/\//i.test(url))
    return {
      ok: false as const,
      error: 'Enter a full https:// signing link.',
    };
  const service = getSupabaseServiceRoleClient();
  // Record a proper envelope row so the link shows in the deal's Signing links
  // panel and is visible to every party (esign participant-read policy).
  await service.from('esign_envelopes').insert({
    firm_id: a.search.firm_id,
    search_id: a.search.id,
    provider: 'manual',
    envelope_id: 'manual-' + (globalThis.crypto?.randomUUID?.() || Date.now()),
    envelope_url: url,
    status: 'sent',
    recipients: [],
    created_by: a.me.user_id,
  });
  const { error } = await service
    .from('client_searches')
    .update({ docusign_envelope_url: url })
    .eq('id', a.search.id);
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'docusign_linked',
    url
  );
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function setAttorneyAction(
  clientId: string,
  payload: { name: string; email?: string; phone?: string }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.name)
    return { ok: false as const, error: 'Name is required.' };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('client_searches')
    .update({
      attorney_name: payload.name,
      attorney_email: payload.email || null,
      attorney_phone: payload.phone || null,
    })
    .eq('id', a.search.id);
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'attorney_added',
    payload.name,
    { email: payload.email, phone: payload.phone }
  );
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function sendAlertAction(clientId: string, message: string) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!message.trim())
    return { ok: false as const, error: 'Alert text is required.' };
  const service = getSupabaseServiceRoleClient();
  // Insert as a message tagged ALERT and also write an activity row.
  const { data: msg, error } = await service
    .from('messages')
    .insert({
      firm_id: a.search.firm_id,
      search_id: a.search.id,
      sender_id: a.me.user_id,
      body: 'ALERT: ' + message.trim(),
    })
    .select('id')
    .single();
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'alert',
    message.slice(0, 80)
  );
  // Fire push (best-effort, server side)
  try {
    const base = process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    await fetch(base + '/api/notifications/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        searchId: a.search.id,
        messageId: msg?.id,
        kind: 'alert',
      }),
    });
  } catch {}
  // Email + SMS every person on this deal.
  try {
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + a.search.id;
    await notifyDealParticipants({
      searchId: a.search.id,
      subject: 'Alert from your realtor',
      text:
        'Alert from your realtor:\n\n' +
        message.trim() +
        '\n\nOpen the deal: ' +
        dealUrl,
      html: `<p><strong>Alert from your realtor:</strong></p><p>${escapeHtml(
        message.trim()
      )}</p><p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
      sms_text: 'ALERT: ' + message.trim().slice(0, 240) + ' — ' + dealUrl,
      excludeUserId: a.me.user_id,
    });
  } catch (e: any) {
    console.error('[sendAlertAction] notify failed', e?.message || e);
  }
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

/**
 * Add a SELLER-SIDE, HOUSE-SCOPED participant to a deal and send them the
 * branded /invite/<token> email — mirroring addParticipantAction's invite
 * pattern. Used by the convergence capture in goUnderContractAction.
 *
 * Idempotent: if a participant for the same email already exists on the
 * search we skip the insert (and skip re-inviting). If a user already exists
 * with that email we auto-link via user_id so login just works.
 *
 * `house_id` scopes the party to ONE house — they will only ever see that
 * property on the deal read paths, never the buyer's other candidates.
 */
async function addHouseScopedSellerParty(
  service: ReturnType<typeof getSupabaseServiceRoleClient>,
  opts: {
    searchId: string;
    firmId: string;
    createdBy: string;
    houseId: string;
    role: 'co_realtor' | 'seller';
    name: string | null;
    email: string | null;
    firmName: string | null;
  }
): Promise<void> {
  const email = opts.email?.trim() || null;
  const name = opts.name?.trim() || null;

  // Idempotency: don't duplicate a participant for the same email+search.
  if (email) {
    const { data: existing } = await service
      .from('deal_participants')
      .select('id')
      .eq('search_id', opts.searchId)
      .ilike('external_email', email)
      .limit(1);
    if (existing && existing.length > 0) return;
  }

  // Auto-link: if a user already exists with this email, attach user_id so
  // their login resolves to the deal automatically.
  let userId: string | null = null;
  let userPhone: string | null = null;
  if (email) {
    const { data: u } = await service
      .from('users')
      .select('id, phone')
      .ilike('email', email)
      .maybeSingle();
    userId = (u as any)?.id ?? null;
    userPhone = (u as any)?.phone ?? null;
  }

  const { data: inserted, error } = await service
    .from('deal_participants')
    .insert({
      search_id: opts.searchId,
      firm_id: opts.firmId,
      house_id: opts.houseId,
      user_id: userId,
      external_email: email,
      external_name: name,
      role: opts.role,
      represents: 'seller',
      // House-scoped seller parties get the same conservative default
      // visibility as any added party — they can see docs + dates but not
      // financials or the buyer-side message thread by default.
      can_view_documents: true,
      can_view_financials: false,
      can_view_messages: false,
      can_view_dates: true,
      created_by: opts.createdBy,
    })
    .select('id')
    .single();
  if (error) {
    console.error(
      '[addHouseScopedSellerParty] insert failed',
      error.message
    );
    return;
  }

  // Branded /invite/<token> — mirrors addParticipantAction. Only when we have
  // an email to send to.
  if (!email) return;
  let invitePath: string | null = null;
  try {
    const { data: inviteRow } = await service
      .from('deal_invites')
      .insert({
        search_id: opts.searchId,
        firm_id: opts.firmId,
        participant_id: (inserted as any).id,
        role: opts.role,
        name,
        email: email.toLowerCase(),
        created_by: opts.createdBy,
      })
      .select('token')
      .single();
    if (inviteRow) invitePath = '/invite/' + (inviteRow as any).token;
  } catch (e: any) {
    console.error(
      '[addHouseScopedSellerParty] deal_invites insert threw',
      e?.message || e
    );
  }

  try {
    const { data: ctx } = await service
      .from('client_searches')
      .select(
        `firm:firms ( name ), realtor:users!client_searches_realtor_id_fkey ( full_name, email )`
      )
      .eq('id', opts.searchId)
      .maybeSingle();
    const firmName = (ctx as any)?.firm?.name || 'a Realtor Portal firm';
    const realtorName =
      (ctx as any)?.realtor?.full_name ||
      (ctx as any)?.realtor?.email ||
      'The buyer\'s agent';
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + opts.searchId;
    const primaryUrl = invitePath ? siteUrl + invitePath : dealUrl;
    const rolePretty =
      opts.role === 'co_realtor' ? 'listing agent' : 'seller';
    const displayName = name || email;
    const safeName = escapeHtml(displayName);
    const safeRealtor = escapeHtml(realtorName);
    const safeFirm = escapeHtml(firmName);
    const subject = `${realtorName} (${firmName}) is going under contract on your listing`;
    const html = `
        <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
          <h2 style="font-size:20px;margin:0 0 12px">You've been added to a transaction</h2>
          <p>${safeRealtor} at <strong>${safeFirm}</strong> added you as the <strong>${escapeHtml(rolePretty)}</strong> on a deal going under contract for your property.</p>
          <p>You'll collaborate on <em>this one property only</em> — you won't see anything else on the buyer's side.</p>
          <p style="margin:24px 0">
            <a href="${primaryUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Open the transaction &rarr;</a>
          </p>
          <p style="color:#94A3B8;font-size:12px">If the button doesn't work, paste this link into your browser: ${primaryUrl}</p>
          <p style="color:#64748B;font-size:13px">Hi ${safeName}.</p>
        </div>
      `;
    const text =
      `${realtorName} at ${firmName} added you as ${rolePretty} on a deal going under contract for your property.\n\n` +
      `You'll collaborate on this one property only.\n\n` +
      `Open the transaction:\n${primaryUrl}`;
    await notify({
      email,
      phone: userPhone,
      subject,
      text,
      html,
      sms_text: `${realtorName} (${firmName}) added you as ${rolePretty} on a transaction. Open: ${primaryUrl}`,
    });
  } catch (e: any) {
    console.error(
      '[addHouseScopedSellerParty] notify failed',
      e?.message || e
    );
  }
}

/**
 * TWO-WAY CROSS-FIRM LINKING (Phase 2).
 *
 * When a buyer deal captures the listing agent for the house it's going under
 * contract on, the listing agent may *also* be running this same property as a
 * SELLER deal inside Realtor Portal. If so, we want to connect the two sides so
 * the seller's "Buyer interest" panel can show "1 buyer under contract" without
 * either side ever seeing the other's private data.
 *
 * We connect them by stamping `houses.listing_search_id` on the buyer-deal house
 * with the id of the matching seller deal. Matching is conservative:
 *   1. Resolve the listing agent's firm. If their email belongs to an in-app
 *      user, use that user's firm_id. (We never guess across firms by name.)
 *   2. Within that firm, find a seller-side deal (kind in 'seller','both') that
 *      owns a house whose address matches the chosen house address
 *      (case-insensitive, trimmed).
 *   3. If exactly such a deal exists, set houses.listing_search_id and log it.
 *
 * Fully best-effort and idempotent: any failure is swallowed so it can never
 * break the under-contract flip. If the column/relationship isn't present yet,
 * the try/catch around the caller absorbs it.
 */
async function tryLinkSellerDeal(
  service: ReturnType<typeof getSupabaseServiceRoleClient>,
  opts: {
    buyerSearchId: string;
    firmId: string;
    actorId: string;
    houseId: string;
    houseAddress: string | null;
    listingAgentEmail: string | null;
  }
): Promise<void> {
  const address = opts.houseAddress?.trim();
  const listingEmail = opts.listingAgentEmail?.trim().toLowerCase();
  if (!address || !listingEmail) return;

  // Idempotency: if this house is already linked, do nothing.
  const { data: houseRow } = await service
    .from('houses')
    .select('id, listing_search_id')
    .eq('id', opts.houseId)
    .maybeSingle();
  if (!houseRow) return;
  if ((houseRow as any).listing_search_id) return;

  // 1) Resolve the listing agent's firm via an in-app user with that email.
  //    We deliberately only auto-link when the listing agent is a real user —
  //    that's the signal that "both sides run this in-app".
  const { data: agentUser } = await service
    .from('users')
    .select('id, firm_id')
    .ilike('email', listingEmail)
    .maybeSingle();
  const agentFirmId = (agentUser as any)?.firm_id as string | undefined;
  if (!agentFirmId) return;

  // 2) Find seller-side deals in that firm and match by listing-house address.
  const { data: sellerDeals } = await service
    .from('client_searches')
    .select('id, kind, houses ( id, address )')
    .eq('firm_id', agentFirmId)
    .in('kind', ['seller', 'both']);
  if (!sellerDeals || sellerDeals.length === 0) return;

  const wantAddr = address.toLowerCase();
  let matchedSellerSearchId: string | null = null;
  for (const d of sellerDeals as any[]) {
    const dealHouses = Array.isArray(d.houses) ? d.houses : [];
    const hit = dealHouses.some(
      (h: any) => (h.address || '').trim().toLowerCase() === wantAddr
    );
    if (hit) {
      matchedSellerSearchId = d.id;
      break;
    }
  }
  if (!matchedSellerSearchId) return;
  // Don't link a deal to itself (shouldn't happen across firms, but be safe).
  if (matchedSellerSearchId === opts.buyerSearchId) return;

  // 3) Stamp the link onto the buyer-deal house.
  const { error: linkErr } = await service
    .from('houses')
    .update({ listing_search_id: matchedSellerSearchId })
    .eq('id', opts.houseId)
    .eq('search_id', opts.buyerSearchId);
  if (linkErr) {
    console.error('[tryLinkSellerDeal] link update failed', linkErr.message);
    return;
  }

  // Log it on the buyer deal so the timeline reflects the convergence.
  try {
    await service.from('activities').insert({
      firm_id: opts.firmId,
      search_id: opts.buyerSearchId,
      actor_id: opts.actorId,
      action: 'seller_deal_linked',
      target: address,
      metadata: { listing_search_id: matchedSellerSearchId, house_id: opts.houseId },
    });
  } catch (e: any) {
    console.error('[tryLinkSellerDeal] activity insert failed', e?.message || e);
  }
}

/**
 * "Going under contract" workflow. One submit that:
 *  - Flips deal phase → under_contract
 *  - Saves binding date, earnest due, due-diligence end, closing day as
 *    important_dates rows
 *  - Stores contract URL on the search
 *  - Emails ALL parties with the snapshot
 *
 * Saves the realtor from doing this manually for every deal.
 */
export async function goUnderContractAction(
  clientId: string,
  payload: {
    binding_date?: string | null;
    earnest_money_due?: string | null;
    earnest_money_amount?: number | null;
    due_diligence_end?: string | null;
    closing_date?: string | null;
    contract_url?: string | null;
    message?: string;
    // PHASE 1 — convergence capture. When the buyer-side realtor knows which
    // house they're going under contract on, they pick it here and (optionally)
    // tell us who's on the SELLING side. We mark that house under contract,
    // store the seller_* info on it, and add the listing agent / seller as
    // house-scoped deal participants (represents='seller', house_id=<house>).
    offer_house_id?: string | null;
    seller_name?: string | null;
    seller_email?: string | null;
    seller_realtor_name?: string | null;
    seller_realtor_email?: string | null;
    seller_realtor_firm?: string | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();

  // Phase update is the source-of-truth write — bail out on failure so we
  // don't create a half-state (dates inserted, message posted, parties
  // emailed) without the phase actually flipping.
  const searchUpdate: Record<string, any> = {
    phase: 'under_contract',
    contract_url: payload.contract_url || null,
    earnest_money: payload.earnest_money_amount ?? null,
  };
  // Record the chosen house on the search so the workspace / read paths know
  // which candidate converted into the live transaction.
  if (payload.offer_house_id) searchUpdate.offer_house_id = payload.offer_house_id;
  const { error: phaseErr } = await service
    .from('client_searches')
    .update(searchUpdate)
    .eq('id', a.search.id);
  if (phaseErr)
    return { ok: false as const, error: phaseErr.message };

  // ---- Convergence capture: "Who's selling this house?" -------------------
  // Only runs when the realtor picked a specific house. Marks it under
  // contract, writes the seller_* fields, and links the other side as
  // house-scoped participants. All best-effort: failures here must NOT undo
  // the under-contract flip above.
  if (payload.offer_house_id) {
    try {
      const houseUpdate: Record<string, any> = { is_under_contract: true };
      if (payload.seller_name !== undefined)
        houseUpdate.seller_name = payload.seller_name?.trim() || null;
      if (payload.seller_email !== undefined)
        houseUpdate.seller_email = payload.seller_email?.trim() || null;
      if (payload.seller_realtor_name !== undefined)
        houseUpdate.seller_realtor_name =
          payload.seller_realtor_name?.trim() || null;
      if (payload.seller_realtor_email !== undefined)
        houseUpdate.seller_realtor_email =
          payload.seller_realtor_email?.trim() || null;
      if (payload.seller_realtor_firm !== undefined)
        houseUpdate.seller_realtor_firm =
          payload.seller_realtor_firm?.trim() || null;
      // Scope the write to this deal's firm + search so we never touch a
      // house on another deal even if the id is wrong.
      await service
        .from('houses')
        .update(houseUpdate)
        .eq('id', payload.offer_house_id)
        .eq('search_id', a.search.id);

      // Add the listing agent (and optionally the seller) as house-scoped
      // seller-side participants. They land on the deal seeing ONLY this house.
      if (payload.seller_realtor_email || payload.seller_realtor_name) {
        await addHouseScopedSellerParty(service, {
          searchId: a.search.id,
          firmId: a.search.firm_id,
          createdBy: a.me.user_id,
          houseId: payload.offer_house_id,
          role: 'co_realtor',
          name: payload.seller_realtor_name || null,
          email: payload.seller_realtor_email || null,
          firmName: payload.seller_realtor_firm || null,
        });
      }
      if (payload.seller_email || payload.seller_name) {
        await addHouseScopedSellerParty(service, {
          searchId: a.search.id,
          firmId: a.search.firm_id,
          createdBy: a.me.user_id,
          houseId: payload.offer_house_id,
          role: 'seller',
          name: payload.seller_name || null,
          email: payload.seller_email || null,
          firmName: null,
        });
      }

      // Two-way cross-firm linking: if the listing agent also runs this same
      // property as a seller deal in-app, stamp houses.listing_search_id so the
      // two sides converge. Best-effort, idempotent — never breaks the flip.
      try {
        const { data: chosenHouse } = await service
          .from('houses')
          .select('address')
          .eq('id', payload.offer_house_id)
          .maybeSingle();
        await tryLinkSellerDeal(service, {
          buyerSearchId: a.search.id,
          firmId: a.search.firm_id,
          actorId: a.me.user_id,
          houseId: payload.offer_house_id,
          houseAddress: (chosenHouse as any)?.address ?? null,
          listingAgentEmail: payload.seller_realtor_email || null,
        });
      } catch (e: any) {
        console.error(
          '[goUnderContractAction] tryLinkSellerDeal failed',
          e?.message || e
        );
      }
    } catch (e: any) {
      console.error(
        '[goUnderContractAction] convergence capture failed',
        e?.message || e
      );
    }
  }

  // Insert important dates (replace any existing rows with same label).
  const dates: Array<{ label: string; date: string }> = [];
  if (payload.binding_date)
    dates.push({ label: 'Binding agreement', date: payload.binding_date });
  if (payload.earnest_money_due)
    dates.push({ label: 'Earnest money due', date: payload.earnest_money_due });
  if (payload.due_diligence_end)
    dates.push({ label: 'Due diligence ends', date: payload.due_diligence_end });
  if (payload.closing_date)
    dates.push({ label: 'Closing day', date: payload.closing_date });
  for (const d of dates) {
    await service.from('important_dates').upsert(
      {
        firm_id: a.search.firm_id,
        search_id: a.search.id,
        label: d.label,
        date: d.date,
        created_by: a.me.user_id,
      },
      { onConflict: 'search_id,label' as any, ignoreDuplicates: false }
    );
  }

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'phase_change',
    'under_contract',
    { dates }
  );

  // Celebration message in-thread.
  await service.from('messages').insert({
    firm_id: a.search.firm_id,
    search_id: a.search.id,
    sender_id: a.me.user_id,
    body:
      'Congrats — we are UNDER CONTRACT! Key dates and contract are in the deal view.',
  });

  // Email everyone the whole snapshot.
  try {
    await emailEveryoneOnPhaseChange({
      searchId: a.search.id,
      newPhase: 'under_contract',
      message: payload.message,
      contractUrl: payload.contract_url || null,
      importantDates: dates,
    });
  } catch {}

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

/**
 * CLIENT ↔ REALTOR HOUSE AGREEMENT — realtor side.
 *
 * The realtor sets (or changes) the house the deal is about. Writes
 * client_searches.offer_house_id + house_agreed_at + house_agreed_by (= the
 * realtor), logs an activity row, and best-effort notifies the client so the
 * agreement surfaces on their home. Mirrors the client-side
 * markAgreedHouseAction so either party can establish the agreed home and the
 * other side sees it.
 */
export async function setAgreedHouseAction(
  clientId: string,
  houseId: string
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!houseId) return { ok: false as const, error: 'Pick a house.' };
  const service = getSupabaseServiceRoleClient();

  // Confirm the house is on THIS deal before agreeing to it.
  const { data: house } = await service
    .from('houses')
    .select('id, address, search_id')
    .eq('id', houseId)
    .eq('search_id', a.search.id)
    .maybeSingle();
  if (!house)
    return { ok: false as const, error: 'That house is not on this deal.' };

  // Auto-open the next phase when the home is confirmed from searching.
  const { data: cur } = await service
    .from('client_searches')
    .select('phase')
    .eq('id', a.search.id)
    .maybeSingle();
  const curPhase = (cur as any)?.phase as string | null;

  const agreedUpdate: Record<string, any> = {
    offer_house_id: houseId,
    house_agreed_at: new Date().toISOString(),
    house_agreed_by: a.me.user_id,
    house_proposed_house_id: null,
    house_proposed_by: null,
    house_proposed_at: null,
  };
  if (!curPhase || curPhase === 'searching') {
    agreedUpdate.phase = 'awaiting_offer';
  }

  const { error } = await service
    .from('client_searches')
    .update(agreedUpdate)
    .eq('id', a.search.id);
  if (error) return { ok: false as const, error: error.message };

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'house_agreed',
    (house as any).address || houseId,
    { house_id: houseId, by: 'realtor' }
  );

  // Best-effort: notify the client that the agreed home is set.
  try {
    const { data: ctx } = await service
      .from('client_searches')
      .select(
        `client:users!client_searches_client_id_fkey ( email, phone, full_name )`
      )
      .eq('id', a.search.id)
      .maybeSingle();
    const client = (ctx as any)?.client;
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const homeUrl = siteUrl + '/client/houses/' + houseId;
    const addr = (house as any).address || 'your home';
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
  } catch (e: any) {
    console.error('[setAgreedHouseAction] notify failed', e?.message || e);
  }

  // Push to the client side (best effort).
  try {
    const base = process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    await fetch(base + '/api/notifications/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ searchId: a.search.id, kind: 'house_agreed' }),
    });
  } catch {}

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function updateDealFinancialsAction(
  clientId: string,
  payload: {
    agreed_price?: number | null;
    closing_amount?: number | null;
    earnest_money?: number | null;
    commission_pct?: number | null;
    contract_url?: string | null;
    notes?: string | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const update: Record<string, any> = {};
  if (payload.agreed_price !== undefined) update.agreed_price = payload.agreed_price;
  if (payload.closing_amount !== undefined) update.closing_amount = payload.closing_amount;
  if (payload.earnest_money !== undefined) update.earnest_money = payload.earnest_money;
  if (payload.commission_pct !== undefined) update.commission_pct = payload.commission_pct;
  if (payload.contract_url !== undefined) update.contract_url = payload.contract_url;
  if (payload.notes !== undefined) update.notes = payload.notes;
  const { error } = await service
    .from('client_searches')
    .update(update)
    .eq('id', a.search.id);
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'deal_updated',
    Object.keys(update).join(', '),
    update
  );
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function editHouseAction(
  clientId: string,
  houseId: string,
  payload: {
    address?: string;
    list_price?: number | null;
    listing_url?: string | null;
    photo_url?: string | null;
    notes?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    square_feet?: number | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const update: Record<string, any> = {};
  for (const k of [
    'address',
    'list_price',
    'listing_url',
    'photo_url',
    'notes',
    'bedrooms',
    'bathrooms',
    'square_feet',
  ] as const) {
    if (payload[k] !== undefined) update[k] = payload[k];
  }
  const { error } = await service
    .from('houses')
    .update(update)
    .eq('id', houseId)
    .eq('firm_id', a.search.firm_id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function deleteHouseAction(clientId: string, houseId: string) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('houses')
    .delete()
    .eq('id', houseId)
    .eq('firm_id', a.search.firm_id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export type PartyRole =
  | 'realtor'
  | 'co_realtor'
  | 'buyer'
  | 'seller'
  | 'attorney'
  | 'inspector'
  | 'lender'
  | 'appraiser'
  | 'title_agent'
  | 'mortgage_broker'
  | 'other';

export async function addParticipantAction(
  clientId: string,
  payload: {
    role: PartyRole;
    name?: string;
    email?: string;
    phone?: string;
    represents?: 'buyer' | 'seller';
    can_view_documents?: boolean;
    can_view_financials?: boolean;
    can_view_messages?: boolean;
    can_view_dates?: boolean;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.name && !payload.email && !payload.phone)
    return {
      ok: false as const,
      error: 'Give me a name, phone, or email so we can identify them.',
    };
  // `represents` is only meaningful for co-realtors (buyer-side / seller-side).
  // Ignore (NULL) it for any other role, and reject an out-of-range value.
  const represents =
    payload.role === 'co_realtor' &&
    (payload.represents === 'buyer' || payload.represents === 'seller')
      ? payload.represents
      : null;
  const service = getSupabaseServiceRoleClient();
  // Match an existing user by email so logging in works automatically.
  let userId: string | null = null;
  let userPhone: string | null = null;
  if (payload.email) {
    const { data: u } = await service
      .from('users')
      .select('id, phone')
      .ilike('email', payload.email)
      .maybeSingle();
    userId = (u as any)?.id ?? null;
    userPhone = (u as any)?.phone ?? null;
  }
  // RETURN the inserted row so the client can patch its local "People"
  // list directly without waiting on revalidatePath or realtime. This is
  // the source of truth — realtime is purely a "make it nicer when other
  // people add parties" mechanism.
  // When a visibility flag is omitted by the caller, fall back to the
  // role-based defaults (single source of truth in lib/partyPermissions).
  const perms = defaultPartyPermissions(payload.role);
  const { data: inserted, error } = await service
    .from('deal_participants')
    .insert({
      search_id: a.search.id,
      firm_id: a.search.firm_id,
      user_id: userId,
      external_email: payload.email || null,
      external_name: payload.name || null,
      external_phone: payload.phone || null,
      role: payload.role,
      represents,
      can_view_documents: payload.can_view_documents ?? perms.can_view_documents,
      can_view_financials: payload.can_view_financials ?? perms.can_view_financials,
      can_view_messages: payload.can_view_messages ?? perms.can_view_messages,
      can_view_dates: payload.can_view_dates ?? perms.can_view_dates,
      created_by: a.me.user_id,
    })
    .select(
      'id, role, represents, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
    )
    .single();
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    payload.role + '_added',
    payload.name || payload.email || ''
  );

  // Fire-and-forget invite email + SMS via the unified notify() helper.
  //
  // When the participant role is realtor/co_realtor AND there isn't already
  // an account for that email, we send a "set up your free Realtor Portal
  // account to collaborate on this deal" version of the email. They land on
  // /signup as a realtor; once signed up, the existing can_collab_on_search
  // RLS function recognizes their email and grants deal access. They also
  // get to use premium features ON THIS DEAL even on the free plan, because
  // the deal is hosted by the inviting firm (see canUsePremiumForDeal).
  //
  // Notification channels:
  //   - email — if we have an address
  //   - SMS   — if the inviter typed a phone number, OR the matching
  //             firm-user has a phone on file
  let notifyResult: any = null;
  // Hoisted outside the inner try so the return value can pass the
  // invite URL back to the realtor's UI for a "copy invite link"
  // fallback when email/SMS delivery is unreliable.
  let outerMagicLinkUrl: string | null = null;

  // FIRST-CLASS INVITE TOKEN.
  // Every party we add with contact info gets a row in deal_invites and
  // a /invite/<token> URL. That URL serves a branded role-aware landing
  // page that knows (without auth) who the recipient is, what role
  // they're being added as, whether they already have an account, and
  // routes them to the right onboarding. The SMS body + the toast's
  // copy-to-clipboard fallback both use this URL instead of the
  // Supabase magic link (which is fragile, requires email delivery,
  // and dumps un-authenticated visitors on /login).
  let invitePath: string | null = null;
  if (payload.email || payload.phone) {
    try {
      const { data: inviteRow, error: inviteErr } = await service
        .from('deal_invites')
        .insert({
          search_id: a.search.id,
          firm_id: a.search.firm_id,
          participant_id: (inserted as any).id,
          role: payload.role,
          name: payload.name || null,
          email: payload.email ? payload.email.toLowerCase() : null,
          phone: payload.phone || null,
          created_by: a.me.user_id,
        })
        .select('token')
        .single();
      if (inviteErr) {
        // Surface the actual error so we can debug from Vercel logs
        // instead of silently falling back to the supabase magic link.
        console.error(
          '[addParticipantAction] deal_invites insert error',
          {
            code: (inviteErr as any).code,
            message: inviteErr.message,
            details: (inviteErr as any).details,
            hint: (inviteErr as any).hint,
          }
        );
      } else if (inviteRow) {
        invitePath =
          '/invite/' + (inviteRow as any).token;
        console.log(
          '[addParticipantAction] deal_invites inserted ok',
          { token: (inviteRow as any).token, role: payload.role }
        );
      }
    } catch (e: any) {
      console.error(
        '[addParticipantAction] deal_invites insert threw',
        e?.message || e,
        e?.stack
      );
    }
  }
  if (payload.email || payload.phone || userPhone) {
    try {
      const { data: ctx } = await service
        .from('client_searches')
        .select(
          `name, firm:firms ( name ), realtor:users!client_searches_realtor_id_fkey ( full_name, email, phone )`
        )
        .eq('id', a.search.id)
        .maybeSingle();
      const firmName = (ctx as any)?.firm?.name || 'a Realtor Portal firm';
      const realtorName =
        (ctx as any)?.realtor?.full_name ||
        (ctx as any)?.realtor?.email ||
        'Your realtor';
      const siteUrl =
        process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
      const dealUrl = siteUrl + '/deal/' + a.search.id;
      const isRealtorRole =
        payload.role === 'realtor' || payload.role === 'co_realtor';
      const isAttorneyRole = payload.role === 'attorney';
      // External collaborators (realtor / co_realtor / attorney) and all
      // other parties are invited through OUR branded /invite/<token>
      // landing — never through a Supabase auth email. The token landing
      // is unauthenticated, branded, role-aware, and sets up the account
      // (password or sign-in) itself. We keep a /signup fallback only for
      // the rare case where the deal_invites insert failed and we have no
      // token to link to.
      const signupUrl =
        siteUrl +
        '/signup?role=realtor' +
        (payload.email ? '&email=' + encodeURIComponent(payload.email) : '') +
        '&next=' +
        encodeURIComponent('/deal/' + a.search.id);

      const rolePretty = payload.role.replace(/_/g, ' ');
      const displayName = payload.name || payload.email || 'there';
      const safeName = escapeHtml(displayName);
      const safeRealtor = escapeHtml(realtorName);
      const safeFirm = escapeHtml(firmName);
      const safeRole = escapeHtml(rolePretty);
      const subject = isRealtorRole
        ? `${realtorName} invited you to co-broker a deal at ${firmName}`
        : `${realtorName} added you to a real-estate deal at ${firmName}`;
      // The /invite/<token> landing is ALWAYS the primary URL — it works
      // without auth, is fully branded, and routes the recipient by role
      // automatically. The /signup URL is only a fallback for the rare
      // case where the deal_invites insert failed.
      const primaryUrl = invitePath ? siteUrl + invitePath : signupUrl;
      // Track the URL on the hoisted var so the action's return value
      // surfaces it for the realtor's copy/share fallback.
      outerMagicLinkUrl = primaryUrl;
      const realtorBody = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
            <h2 style="font-size:20px;margin:0 0 12px">You've been invited to co-broker a deal</h2>
            <p>${safeRealtor} at <strong>${safeFirm}</strong> added you as <strong>${safeRole}</strong> on a real-estate deal in Realtor Portal.</p>
            <p>Tap below to set up your free account and open the deal. You can add <em>your own client</em> as a buyer or seller from your own firm, and use Realtor Portal's deal tools on this deal even if your firm doesn't have a paid plan.</p>
            <p style="margin:24px 0">
              <a href="${primaryUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Set up free account &amp; open the deal &rarr;</a>
            </p>
            <p style="color:#64748B;font-size:13px">Already on Realtor Portal? <a href="${dealUrl}" style="color:#0F172A">Open the deal directly</a>.</p>
            <p style="color:#64748B;font-size:13px">Hi ${safeName} &mdash; on this deal you can share documents, line up tours, message your client and ${safeRealtor}, and track closing milestones.</p>
          </div>
        `;
      const partyBody = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
            <h2 style="font-size:20px;margin:0 0 12px">You've been added to a deal</h2>
            <p>${safeRealtor} at <strong>${safeFirm}</strong> added you to a real-estate deal as <strong>${safeRole}</strong>.</p>
            <p style="margin:24px 0">
              <a href="${primaryUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Accept invite &amp; open the deal &rarr;</a>
            </p>
            <p style="color:#64748B;font-size:13px">You'll see whatever ${safeRealtor} chose to share with you: important dates, documents, financials, or messages. Hi ${safeName}.</p>
            <p style="color:#94A3B8;font-size:12px">If the button above doesn't work, paste this link into your browser: ${primaryUrl}</p>
          </div>
        `;
      const realtorText =
        `${realtorName} at ${firmName} invited you to co-broker a deal as ${rolePretty}.\n\n` +
        `Tap to set up your free account:\n${primaryUrl}\n\n` +
        `Already have an account? Open the deal directly:\n${dealUrl}\n\n` +
        `You can add your own client (buyer or seller) from your own firm, and use Realtor Portal's deal tools on this deal even if your firm doesn't have a paid plan.`;
      const partyText =
        `${realtorName} at ${firmName} added you to a deal as ${rolePretty}.\n\n` +
        `Tap to accept and open the deal:\n${primaryUrl}\n\n` +
        `You'll see whatever ${realtorName} chose to share with you (dates, documents, financials, messages).`;
      // Compact SMS body — Twilio cuts at 1600, but real-world deliverability
      // is much better under 320 (which fits in 2 SMS segments).
      // ALWAYS use primaryUrl (the /invite/<token> landing). The deal URL
      // requires auth and dumps un-authenticated visitors on /login.
      const smsBody = isRealtorRole
        ? `${realtorName} (${firmName}) invited you to co-broker a deal on Realtor Portal. Tap to open: ${primaryUrl}`
        : `${realtorName} (${firmName}) added you to a real-estate deal as ${rolePretty}. Tap to accept: ${primaryUrl}`;

      // Always send OUR branded invite email via Resend (sendEmail) — never
      // a Supabase auth/magic-link email. The CTA points at /invite/<token>.
      notifyResult = await notify({
        email: payload.email || null,
        phone: payload.phone || userPhone,
        subject,
        text: isRealtorRole || isAttorneyRole ? realtorText : partyText,
        html: isRealtorRole || isAttorneyRole ? realtorBody : partyBody,
        sms_text: smsBody,
      });
    } catch (e: any) {
      console.error('[addParticipantAction] notify failed', e?.message || e);
    }
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  // Return the new row so the client can patch the People list immediately
  // without depending on revalidatePath or realtime delivery.
  return {
    ok: true as const,
    participant: inserted as any,
    notify: notifyResult,
    // Surfaced for the realtor so they can copy/share the magic link
    // when email + SMS don't reach the recipient (e.g. Twilio still in
    // verification, Supabase free-tier SMTP throttled). The link is
    // safe to share — Supabase auth single-uses it on click.
    invite_url: outerMagicLinkUrl,
  };
}

export async function removeParticipantAction(
  clientId: string,
  participantId: string
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('deal_participants')
    .delete()
    .eq('id', participantId)
    .eq('search_id', a.search.id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

/**
 * Edit an existing party on this deal. Lets the realtor change the role
 * (e.g. promote someone from buyer to co_realtor), rename them, fix a
 * typo'd email/phone, or flip any of the visibility flags. Returns the
 * updated row so the client can refresh its local state.
 */
export async function updateParticipantAction(
  clientId: string,
  participantId: string,
  patch: {
    role?: PartyRole;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    can_view_documents?: boolean;
    can_view_financials?: boolean;
    can_view_messages?: boolean;
    can_view_dates?: boolean;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  // Build a fresh update payload — only set keys that were provided so we
  // don't overwrite the others to undefined/null by accident.
  const update: Record<string, any> = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.name !== undefined) update.external_name = patch.name;
  if (patch.email !== undefined) update.external_email = patch.email;
  if (patch.phone !== undefined) update.external_phone = patch.phone;
  if (patch.can_view_documents !== undefined)
    update.can_view_documents = patch.can_view_documents;
  if (patch.can_view_financials !== undefined)
    update.can_view_financials = patch.can_view_financials;
  if (patch.can_view_messages !== undefined)
    update.can_view_messages = patch.can_view_messages;
  if (patch.can_view_dates !== undefined)
    update.can_view_dates = patch.can_view_dates;

  const { data: updated, error } = await service
    .from('deal_participants')
    .update(update)
    .eq('id', participantId)
    .eq('search_id', a.search.id)
    .select(
      'id, role, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
    )
    .single();
  if (error) return { ok: false as const, error: error.message };

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'participant_updated',
    (updated as any).external_name ||
      (updated as any).external_email ||
      ''
  );

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const, participant: updated };
}

/**
 * Mass-invite many emails to a single deal as buyer / seller / attorney /
 * etc. Splits the input on comma, semicolon, newline, or whitespace. Adds
 * each as a deal_participants row with default visibility and fires off
 * invite emails.
 */
export async function massInviteAction(
  clientId: string,
  payload: {
    emails: string; // raw textarea content
    role: PartyRole;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const list = payload.emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (list.length === 0)
    return { ok: false as const, error: 'No valid emails found.' };

  let added = 0;
  for (const email of list) {
    const r = await addParticipantAction(clientId, {
      role: payload.role,
      email,
      // sensible default visibility: client-equivalent.
      can_view_documents: true,
      can_view_financials: false,
      can_view_messages: false,
      can_view_dates: true,
    });
    if (r.ok) added++;
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const, added };
}

/**
 * Spin up a new deal (client_searches row) for an existing client. Lets
 * a realtor track repeat business — a buyer comes back next year, a seller
 * who's also looking to buy, etc.
 */
export async function createNewDealAction(
  clientId: string,
  payload: { kind: 'buyer' | 'seller'; name?: string }
) {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false as const, error: 'Not authenticated.' };
  if (
    me.role !== 'realtor' &&
    me.role !== 'firm_admin' &&
    me.role !== 'super_admin'
  )
    return { ok: false as const, error: 'Forbidden.' };
  const service = getSupabaseServiceRoleClient();
  // Confirm client is in our firm.
  const { data: client } = await service
    .from('users')
    .select('id, full_name')
    .eq('id', clientId)
    .eq('firm_id', me.firm_id)
    .maybeSingle();
  if (!client) return { ok: false as const, error: 'Client not found.' };
  const { data: created, error } = await service
    .from('client_searches')
    .insert({
      firm_id: me.firm_id,
      client_id: clientId,
      realtor_id: me.user_id,
      // Deal admin = the staffer who created this deal.
      created_by: me.user_id,
      kind: payload.kind,
      name:
        payload.name?.trim() ||
        ((client as any).full_name || 'New') +
          (payload.kind === 'buyer' ? ' — buyer deal' : ' — listing'),
      phase: 'searching',
    })
    .select('id')
    .single();
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  if (created?.id) revalidatePath('/dashboard/deals/' + created.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const, dealId: created?.id };
}

/**
 * Return everyone in the firm we could add as a party — clients, realtors,
 * staff — plus the de-duplicated set of external people the realtor knows.
 *
 * Sources merged together:
 *   1. users in this firm  (other realtors, firm_admins, managers, clients)
 *   2. firm_contacts       (manually-added address-book entries:
 *                            external co-realtors, lenders, inspectors, etc.)
 *   3. deal_participants   (people previously added to a deal by external_email)
 *
 * All three are dedupe-merged by lower(email). Firm users win when an email
 * collides — that gives the modal the user_id so logging in just works.
 */
export async function searchFirmPeopleAction(clientId: string) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();

  const [users, externals, contacts] = await Promise.all([
    service
      .from('users')
      .select('id, full_name, email, role')
      .eq('firm_id', a.search.firm_id)
      .order('full_name'),
    service
      .from('deal_participants')
      .select('external_email, external_name, external_phone, role')
      .eq('firm_id', a.search.firm_id)
      .not('external_email', 'is', null),
    service
      .from('firm_contacts')
      .select('id, name, email, phone, role, company')
      .eq('firm_id', a.search.firm_id)
      .order('name'),
  ]);

  // Users are returned as-is; the modal renders them in a separate section.
  // For "non-user" people (firm_contacts + past externals), dedupe by email
  // and keep the richest record (firm_contacts wins over deal_participants
  // because it carries name + company that the realtor curated).
  const seen = new Set<string>();
  type ExternalRow = {
    email: string;
    name: string | null;
    phone: string | null;
    role: string;
    company: string | null;
    // Whether this row came from the curated firm_contacts list vs.
    // auto-discovered from past deal_participants. UI uses it to label.
    source: 'contact' | 'past_deal';
  };
  const externalList: ExternalRow[] = [];

  // firm_contacts first so they take precedence in the dedup.
  for (const c of (contacts.data || []) as any[]) {
    if (!c.email) continue;
    const key = (c.email as string).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    externalList.push({
      email: c.email,
      name: c.name,
      phone: c.phone,
      role: c.role || 'other',
      company: c.company,
      source: 'contact',
    });
  }
  for (const p of (externals.data || []) as any[]) {
    if (!p.external_email) continue;
    const key = (p.external_email as string).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    externalList.push({
      email: p.external_email,
      name: p.external_name,
      phone: p.external_phone,
      role: p.role,
      company: null,
      source: 'past_deal',
    });
  }

  // Also drop firm-user emails from externalList so they don't double-render.
  const userEmails = new Set(
    ((users.data || []) as any[]).map((u) => (u.email || '').toLowerCase())
  );
  const externalsFiltered = externalList.filter(
    (e) => !userEmails.has(e.email.toLowerCase())
  );

  return {
    ok: true as const,
    users: (users.data || []) as Array<{
      id: string;
      full_name: string | null;
      email: string;
      role: string;
    }>,
    externals: externalsFiltered,
  };
}

/**
 * Add many participants at once. Each row carries its own role so a realtor
 * can paste 'lender@bank.com:lender, inspector@x.com:inspector' style or
 * use the typed form to pick role-per-person.
 */
export async function massAddPartiesAction(
  clientId: string,
  payload: {
    rows: Array<{
      role: PartyRole;
      name?: string;
      email?: string;
      phone?: string;
    }>;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.rows?.length)
    return { ok: false as const, error: 'No rows to add.' };

  let added = 0;
  let failed = 0;
  for (const row of payload.rows) {
    if (!row.email && !row.name) continue;
    const r = await addParticipantAction(clientId, {
      role: row.role,
      email: row.email,
      name: row.name,
      phone: row.phone,
      can_view_documents: true,
      can_view_financials: false,
      can_view_messages: false,
      can_view_dates: true,
    });
    if (r.ok) added++;
    else failed++;
  }
  return { ok: true as const, added, failed };
}

export async function moveDocumentFolderAction(
  clientId: string,
  payload: { documentId: string; folder: string }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('documents')
    .update({ folder: payload.folder })
    .eq('id', payload.documentId)
    .eq('firm_id', a.search.firm_id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

export async function deleteDocumentAction(
  clientId: string,
  documentId: string
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  // Fetch the storage path so we can delete the object too.
  const { data: doc } = await service
    .from('documents')
    .select('storage_path, firm_id')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc || doc.firm_id !== a.search.firm_id)
    return { ok: false as const, error: 'Document not found.' };
  const { error: rmErr } = await service.storage
    .from('client-docs')
    .remove([doc.storage_path]);
  if (rmErr) {
    // Soft-continue — DB delete is still useful.
  }
  const { error } = await service.from('documents').delete().eq('id', documentId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

/**
 * Realtor counter-proposes a tour time. After the buyer requests one and
 * the realtor (or seller) wants a different time, they fire this from the
 * tour request card. We store realtor_proposed_when alongside the original
 * preferred_when so both are visible to everyone, and we drop a message
 * in the deal thread explaining the new time.
 */
export async function proposeAlternativeTourTimeAction(
  clientId: string,
  payload: {
    tour_request_id: string;
    proposed_when: string;
    note?: string;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.tour_request_id || !payload.proposed_when)
    return { ok: false as const, error: 'Tour and proposed time required.' };
  const service = getSupabaseServiceRoleClient();
  // Make sure the tour request belongs to this firm's deal.
  const { data: tour } = await service
    .from('tour_requests')
    .select('id, firm_id, search_id, house_id, preferred_when, client_id')
    .eq('id', payload.tour_request_id)
    .maybeSingle();
  if (!tour || tour.firm_id !== a.search.firm_id)
    return { ok: false as const, error: 'Tour not in your firm.' };

  const { error } = await service
    .from('tour_requests')
    .update({
      realtor_proposed_when: payload.proposed_when,
      realtor_proposed_note: payload.note?.trim() || null,
      status: 'proposed_alternative',
    })
    .eq('id', payload.tour_request_id);
  if (error) return { ok: false as const, error: error.message };

  // Drop a chat message so the client gets notified.
  const when = new Date(payload.proposed_when).toLocaleString();
  await service.from('messages').insert({
    firm_id: a.search.firm_id,
    search_id: a.search.id,
    sender_id: a.me.user_id,
    body:
      '📅 New time proposed for your tour: ' +
      when +
      (payload.note ? '. ' + payload.note : '. Let me know if that works.'),
  });
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'tour_alt_proposed',
    when
  );

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

/**
 * Send a PRIVATE message to one specific party on this deal. Goes only
 * to them — group messaging on the deal stays open via quickMessageAction.
 *
 * Resolves the recipient either by user_id (firm member or invited
 * realtor who has an account) or by their external_email. The new RLS
 * policies (migration 0029) gate visibility to sender + recipient only.
 *
 * Also fires SMS + email to the recipient via notify() so they actually
 * see the message when they're not in the app.
 */
export async function sendPrivatePartyMessageAction(
  clientId: string,
  participantId: string,
  body: string
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!body.trim())
    return { ok: false as const, error: 'Message body is required.' };

  const service = getSupabaseServiceRoleClient();
  // Resolve the participant on this deal (gives us a recipient identity
  // even if they don't have a public.users row yet).
  const { data: party } = await service
    .from('deal_participants')
    .select('id, user_id, external_email, external_phone, external_name, role')
    .eq('id', participantId)
    .eq('search_id', a.search.id)
    .maybeSingle();
  if (!party)
    return { ok: false as const, error: 'Party not found on this deal.' };

  const { data: msg, error } = await service
    .from('messages')
    .insert({
      firm_id: a.search.firm_id,
      search_id: a.search.id,
      sender_id: a.me.user_id,
      body: body.trim(),
      recipient_user_id: (party as any).user_id || null,
      recipient_email: (party as any).user_id
        ? null
        : (party as any).external_email,
    })
    .select('id')
    .single();
  if (error) return { ok: false as const, error: error.message };

  // Best-effort notify the recipient via SMS + email so they actually
  // see the DM, not just when they happen to open the deal page.
  try {
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + a.search.id;
    const senderName = a.me.full_name || 'Your realtor';
    const trimmed = body.trim();
    let recipientEmail: string | null = (party as any).external_email;
    let recipientPhone: string | null = (party as any).external_phone;
    if ((party as any).user_id) {
      const { data: u } = await service
        .from('users')
        .select('email, phone')
        .eq('id', (party as any).user_id)
        .maybeSingle();
      recipientEmail = (u as any)?.email ?? recipientEmail;
      recipientPhone = (u as any)?.phone ?? recipientPhone;
    }
    await notify({
      email: recipientEmail,
      phone: recipientPhone,
      subject: 'Private message from ' + senderName,
      text:
        senderName +
        ' sent you a private message on the deal:\n\n' +
        trimmed +
        '\n\nReply in the deal: ' +
        dealUrl,
      html: `<p><strong>${escapeHtml(
        senderName
      )}</strong> sent you a private message on the deal:</p><p>${escapeHtml(
        trimmed
      )}</p><p><a href="${dealUrl}">Reply in the deal &rarr;</a></p>`,
      sms_text:
        senderName + ' (private): ' + trimmed.slice(0, 240) + ' — ' + dealUrl,
    });
  } catch (e: any) {
    console.error('[sendPrivatePartyMessageAction] notify failed', e?.message || e);
  }

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'private_message',
    (party as any).external_name ||
      (party as any).external_email ||
      participantId
  );

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  return { ok: true as const, messageId: (msg as any)?.id };
}

export async function quickMessageAction(clientId: string, body: string) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!body.trim())
    return { ok: false as const, error: 'Message body is required.' };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service.from('messages').insert({
    firm_id: a.search.firm_id,
    search_id: a.search.id,
    sender_id: a.me.user_id,
    body: body.trim(),
  });
  if (error) return { ok: false as const, error: error.message };
  // Email + SMS every party on this deal except the sender. The deal-link
  // takes them to the same conversation in-app.
  try {
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + a.search.id;
    const senderName = a.me.full_name || 'Your realtor';
    const trimmed = body.trim();
    await notifyDealParticipants({
      searchId: a.search.id,
      subject: 'New message from ' + senderName,
      text:
        senderName +
        ' sent you a message:\n\n' +
        trimmed +
        '\n\nReply in the deal: ' +
        dealUrl,
      html: `<p><strong>${escapeHtml(
        senderName
      )}</strong> sent you a message:</p><p>${escapeHtml(
        trimmed
      )}</p><p><a href="${dealUrl}">Reply in the deal &rarr;</a></p>`,
      sms_text:
        senderName + ': ' + trimmed.slice(0, 240) + ' — reply: ' + dealUrl,
      excludeUserId: a.me.user_id,
    });
  } catch (e: any) {
    console.error('[quickMessageAction] notify failed', e?.message || e);
  }
  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}

/**
 * Schedule a concrete showing on the deal. Replaces the buyer-driven
 * tour_request flow with an event the realtor owns: fixed datetime,
 * duration, location, and an attendees list. Mirrors the calendar shape
 * everyone expects so the row also drops into important_dates and pushes
 * out an email + SMS to everyone on the deal.
 */
export type ShowingAttendee = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function scheduleShowingAction(
  clientId: string,
  payload: {
    house_id?: string | null;
    scheduled_at: string; // ISO timestamp
    duration_minutes?: number;
    location?: string | null;
    attendees?: ShowingAttendee[];
    notes?: string | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.scheduled_at)
    return { ok: false as const, error: 'A date and time is required.' };
  const when = new Date(payload.scheduled_at);
  if (Number.isNaN(when.getTime()))
    return { ok: false as const, error: 'That date/time is not valid.' };
  const duration = Math.max(
    5,
    Math.min(480, payload.duration_minutes || 30)
  );
  const service = getSupabaseServiceRoleClient();

  // Resolve the house (for the address used in the title + important_dates).
  let address = '';
  if (payload.house_id) {
    const { data: house } = await service
      .from('houses')
      .select('id, address, firm_id, search_id')
      .eq('id', payload.house_id)
      .maybeSingle();
    if (!house || (house as any).search_id !== a.search.id)
      return { ok: false as const, error: 'House not on this deal.' };
    address = (house as any).address || '';
  }

  const attendees = Array.isArray(payload.attendees)
    ? payload.attendees
        .map((p) => ({
          name: p?.name?.trim() || null,
          email: p?.email?.trim() || null,
          phone: p?.phone?.trim() || null,
        }))
        .filter((p) => p.name || p.email || p.phone)
    : [];

  const { data: row, error } = await service
    .from('showings')
    .insert({
      search_id: a.search.id,
      firm_id: a.search.firm_id,
      house_id: payload.house_id || null,
      scheduled_at: when.toISOString(),
      duration_minutes: duration,
      location: payload.location?.trim() || address || null,
      attendees,
      status: 'scheduled',
      notes: payload.notes?.trim() || null,
      created_by: a.me.user_id,
    })
    .select('id')
    .single();
  if (error) return { ok: false as const, error: error.message };

  const label = address ? 'Showing: ' + address : 'Showing';

  // Mirror into important_dates so the calendar export / dates card picks
  // it up alongside everything else.
  //
  // event_time is stored as a Postgres `time` column, so we send the
  // wall-clock time as HH:MM:SS.
  const datePart = when.toISOString().slice(0, 10);
  const timePart = when.toISOString().slice(11, 19);
  try {
    await service.from('important_dates').insert({
      firm_id: a.search.firm_id,
      search_id: a.search.id,
      label,
      date: datePart,
      event_time: timePart,
      location: payload.location?.trim() || address || null,
      notes: 'showing',
      created_by: a.me.user_id,
    });
  } catch (e: any) {
    // Non-fatal: the showing row is the source of truth, the dates row is a
    // convenience mirror.
    console.error('[scheduleShowingAction] important_dates mirror failed', e?.message || e);
  }

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'showing_scheduled',
    address || when.toLocaleString(),
    {
      showing_id: (row as any)?.id,
      scheduled_at: when.toISOString(),
      duration_minutes: duration,
    }
  );

  // Email + SMS everyone on the deal.
  try {
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + a.search.id;
    const pretty =
      when.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }) +
      ' @ ' +
      when.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
    const where = payload.location?.trim() || address;
    const subject = address
      ? `Showing scheduled: ${address} on ${pretty}`
      : `Showing scheduled on ${pretty}`;
    await notifyDealParticipants({
      searchId: a.search.id,
      subject,
      text:
        'A showing has been scheduled:\n\n' +
        (address ? address + '\n' : '') +
        pretty +
        ' (' +
        duration +
        ' min)' +
        (where ? '\nLocation: ' + where : '') +
        (payload.notes ? '\nNotes: ' + payload.notes : '') +
        '\n\nOpen the deal: ' +
        dealUrl,
      html:
        `<p><strong>A showing has been scheduled:</strong></p>` +
        (address ? `<p>${escapeHtml(address)}</p>` : '') +
        `<p>${escapeHtml(pretty)} (${duration} min)</p>` +
        (where ? `<p><strong>Location:</strong> ${escapeHtml(where)}</p>` : '') +
        (payload.notes
          ? `<p><strong>Notes:</strong> ${escapeHtml(payload.notes)}</p>`
          : '') +
        `<p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
      sms_text:
        'Showing scheduled' +
        (address ? ': ' + address : '') +
        ' — ' +
        pretty +
        ' — ' +
        dealUrl,
      excludeUserId: a.me.user_id,
    });
  } catch (e: any) {
    console.error('[scheduleShowingAction] notify failed', e?.message || e);
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  revalidatePath('/dashboard/deals');
  return { ok: true as const, showingId: (row as any)?.id };
}

/**
 * Reschedule an existing showing — same set of fields the caller can change
 * with a single new scheduled_at. Status flips back to 'scheduled' so the
 * "confirmed" badge gets cleared until everyone reconfirms.
 */
export async function rescheduleShowingAction(
  clientId: string,
  payload: {
    showing_id: string;
    scheduled_at: string;
    duration_minutes?: number;
    location?: string | null;
    notes?: string | null;
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.showing_id || !payload.scheduled_at)
    return {
      ok: false as const,
      error: 'Showing and new time are required.',
    };
  const when = new Date(payload.scheduled_at);
  if (Number.isNaN(when.getTime()))
    return { ok: false as const, error: 'That date/time is not valid.' };
  const service = getSupabaseServiceRoleClient();
  const { data: existing } = await service
    .from('showings')
    .select('id, firm_id, search_id, house_id, location, notes')
    .eq('id', payload.showing_id)
    .maybeSingle();
  if (!existing || (existing as any).search_id !== a.search.id)
    return { ok: false as const, error: 'Showing not on this deal.' };

  const updates: Record<string, any> = {
    scheduled_at: when.toISOString(),
    status: 'scheduled',
  };
  if (typeof payload.duration_minutes === 'number')
    updates.duration_minutes = Math.max(
      5,
      Math.min(480, payload.duration_minutes)
    );
  if (payload.location !== undefined)
    updates.location = payload.location?.trim() || null;
  if (payload.notes !== undefined)
    updates.notes = payload.notes?.trim() || null;

  const { error } = await service
    .from('showings')
    .update(updates)
    .eq('id', payload.showing_id);
  if (error) return { ok: false as const, error: error.message };

  // Resolve address for the activity / notify text.
  let address = '';
  if ((existing as any).house_id) {
    const { data: house } = await service
      .from('houses')
      .select('address')
      .eq('id', (existing as any).house_id)
      .maybeSingle();
    address = (house as any)?.address || '';
  }

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'showing_rescheduled',
    address || when.toLocaleString(),
    { showing_id: payload.showing_id, scheduled_at: when.toISOString() }
  );

  try {
    const siteUrl =
      process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
    const dealUrl = siteUrl + '/deal/' + a.search.id;
    const pretty =
      when.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }) +
      ' @ ' +
      when.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
    await notifyDealParticipants({
      searchId: a.search.id,
      subject: address
        ? `Showing rescheduled: ${address} on ${pretty}`
        : `Showing rescheduled on ${pretty}`,
      text:
        'The showing has been moved to:\n\n' +
        (address ? address + '\n' : '') +
        pretty +
        '\n\nOpen the deal: ' +
        dealUrl,
      html:
        `<p><strong>The showing has been moved to:</strong></p>` +
        (address ? `<p>${escapeHtml(address)}</p>` : '') +
        `<p>${escapeHtml(pretty)}</p>` +
        `<p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
      sms_text:
        'Showing moved' +
        (address ? ': ' + address : '') +
        ' — ' +
        pretty +
        ' — ' +
        dealUrl,
      excludeUserId: a.me.user_id,
    });
  } catch (e: any) {
    console.error('[rescheduleShowingAction] notify failed', e?.message || e);
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  return { ok: true as const };
}

/**
 * Mark a showing complete or canceled. Status-only update — the row stays
 * around for activity / history.
 */
export async function updateShowingStatusAction(
  clientId: string,
  payload: {
    showing_id: string;
    status: 'scheduled' | 'confirmed' | 'completed' | 'canceled';
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!payload.showing_id)
    return { ok: false as const, error: 'Showing is required.' };
  if (
    !['scheduled', 'confirmed', 'completed', 'canceled'].includes(payload.status)
  )
    return { ok: false as const, error: 'Bad status.' };
  const service = getSupabaseServiceRoleClient();
  const { data: existing } = await service
    .from('showings')
    .select('id, search_id, house_id')
    .eq('id', payload.showing_id)
    .maybeSingle();
  if (!existing || (existing as any).search_id !== a.search.id)
    return { ok: false as const, error: 'Showing not on this deal.' };

  const { error } = await service
    .from('showings')
    .update({ status: payload.status })
    .eq('id', payload.showing_id);
  if (error) return { ok: false as const, error: error.message };

  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    'showing_' + payload.status,
    payload.showing_id
  );

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + a.search.id);
  return { ok: true as const };
}
