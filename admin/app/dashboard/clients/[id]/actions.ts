'use server';

import { revalidatePath } from 'next/cache';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { emailEveryoneOnPhaseChange } from '@/lib/dealEmail';
import { isFirmPlanActive, canUsePremiumForDeal } from '@/lib/planGate';
import { notify, notifyDealParticipants } from '@/lib/notify';

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
    .select('id, firm_id, client_id, realtor_id, phase')
    .eq('client_id', idOrSearchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!search) {
    const fallback = await supabase
      .from('client_searches')
      .select('id, firm_id, client_id, realtor_id, phase')
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
  // Build update payload — include any phase-specific extras the modal collected.
  const updates: Record<string, any> = { phase };
  if (extras?.offer_amount != null) updates.offer_amount = extras.offer_amount;
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
  revalidatePath('/dashboard/deals');
  return { ok: true as const, houseId: data?.id };
}

export async function linkDocusignAction(clientId: string, url: string) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!/^https?:\/\/.*docusign\./i.test(url))
    return {
      ok: false as const,
      error: 'That does not look like a DocuSign URL.',
    };
  const service = getSupabaseServiceRoleClient();
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
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
  }
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();

  await service
    .from('client_searches')
    .update({
      phase: 'under_contract',
      contract_url: payload.contract_url || null,
      earnest_money: payload.earnest_money_amount ?? null,
    })
    .eq('id', a.search.id);

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
      '🎉 Congrats — we are UNDER CONTRACT! Key dates and contract are in the deal view.',
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
      can_view_documents: payload.can_view_documents ?? true,
      can_view_financials: payload.can_view_financials ?? false,
      can_view_messages: payload.can_view_messages ?? false,
      can_view_dates: payload.can_view_dates ?? true,
      created_by: a.me.user_id,
    })
    .select(
      'id, role, external_name, external_email, external_phone, can_view_documents, can_view_financials, can_view_messages, can_view_dates'
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
      // Cross-firm invite link: realtor signup pre-filled with their email,
      // and once they finish onboarding we route them back to the deal.
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
      const realtorBody = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
            <h2 style="font-size:20px;margin:0 0 12px">You've been invited to co-broker a deal</h2>
            <p>${safeRealtor} at <strong>${safeFirm}</strong> added you as <strong>${safeRole}</strong> on a real-estate deal in Realtor Portal.</p>
            <p>Set up your free Realtor Portal account (or sign in if you already have one) and you'll see the deal in your dashboard. You can add <em>your own client</em> as a buyer or seller from your own firm, and use Realtor Portal's deal tools on this deal even if your firm doesn't have a paid plan.</p>
            <p style="margin:24px 0">
              <a href="${signupUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Set up free account &amp; open the deal &rarr;</a>
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
              <a href="${dealUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Open the deal &rarr;</a>
            </p>
            <p style="color:#64748B;font-size:13px">You'll see whatever ${safeRealtor} chose to share with you: important dates, documents, financials, or messages. Hi ${safeName}.</p>
          </div>
        `;
      const realtorText =
        `${realtorName} at ${firmName} invited you to co-broker a deal as ${rolePretty}.\n\n` +
        `Set up your free Realtor Portal account (or sign in):\n${signupUrl}\n\n` +
        `Already have an account? Open the deal directly:\n${dealUrl}\n\n` +
        `You can add your own client (buyer or seller) from your own firm, and use Realtor Portal's deal tools on this deal even if your firm doesn't have a paid plan.`;
      const partyText =
        `${realtorName} at ${firmName} added you to a deal as ${rolePretty}.\n\n` +
        `Open the deal:\n${dealUrl}\n\n` +
        `You'll see whatever ${realtorName} chose to share with you (dates, documents, financials, messages).`;
      // Compact SMS body — Twilio cuts at 1600, but real-world deliverability
      // is much better under 320 (which fits in 2 SMS segments).
      const smsBody = isRealtorRole
        ? `${realtorName} (${firmName}) invited you to co-broker a deal on Realtor Portal. Sign up free & open: ${signupUrl}`
        : `${realtorName} (${firmName}) added you to a real-estate deal as ${rolePretty}. Open: ${dealUrl}`;

      notifyResult = await notify({
        email: payload.email || null,
        phone: payload.phone || userPhone,
        subject,
        text: isRealtorRole ? realtorText : partyText,
        html: isRealtorRole ? realtorBody : partyBody,
        sms_text: smsBody,
      });
    } catch (e: any) {
      console.error('[addParticipantAction] notify failed', e?.message || e);
    }
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/[id]', 'page');
  revalidatePath('/dashboard/deals');
  // Return the new row so the client can patch the People list immediately
  // without depending on revalidatePath or realtime delivery.
  return {
    ok: true as const,
    participant: inserted as any,
    notify: notifyResult,
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
  revalidatePath('/dashboard/deals/[id]', 'page');
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
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
  revalidatePath('/dashboard/deals/[id]', 'page');
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
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
  revalidatePath('/dashboard/deals/[id]', 'page');
  revalidatePath('/dashboard/deals');
  return { ok: true as const };
}
