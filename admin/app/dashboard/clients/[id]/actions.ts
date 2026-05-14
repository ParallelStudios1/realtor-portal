'use server';

import { revalidatePath } from 'next/cache';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { emailEveryoneOnPhaseChange } from '@/lib/dealEmail';

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

async function authorize(clientId: string) {
  const me = await getMe();
  if (!me?.firm_id) return { error: 'Not authenticated.' as const };
  if (me.role !== 'realtor' && me.role !== 'firm_admin' && me.role !== 'super_admin')
    return { error: 'Forbidden.' as const };
  const supabase = getSupabaseServerClient();
  // Find the active search for (firm, client). All actions are scoped to it.
  const { data: search } = await supabase
    .from('client_searches')
    .select('id, firm_id, client_id, realtor_id, phase')
    .eq('firm_id', me.firm_id)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!search) return { error: 'No deal found for this client.' as const };
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
  under_contract:
    '🎉 Congrats — you are UNDER CONTRACT! Big step. Your agent will line up inspection and appraisal next.',
  closing:
    '🏁 You are in the closing phase. Wire instructions and final paperwork are coming.',
  closed:
    '🏡 CONGRATS! The house is officially yours. Welcome home.',
};

export async function updatePhaseAction(
  clientId: string,
  phase: 'searching' | 'offer_made' | 'under_contract' | 'closing' | 'closed'
) {
  const a = await authorize(clientId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const previousPhase = a.search.phase;
  const { error } = await service
    .from('client_searches')
    .update({ phase })
    .eq('id', a.search.id);
  if (error) return { ok: false as const, error: error.message };
  await activity(a.search.id, a.search.firm_id, a.me.user_id, 'phase_change', phase);

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
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true as const };
}

export async function addImportantDateAction(
  clientId: string,
  payload: { label: string; date: string; kind?: string }
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
  revalidatePath(`/dashboard/clients/${clientId}`);
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
  revalidatePath(`/dashboard/clients/${clientId}`);
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
  if (!payload.name && !payload.email)
    return {
      ok: false as const,
      error: 'Add a name or email so this party can be identified.',
    };
  const service = getSupabaseServiceRoleClient();
  // Match an existing user by email so logging in works automatically.
  let userId: string | null = null;
  if (payload.email) {
    const { data: u } = await service
      .from('users')
      .select('id')
      .ilike('email', payload.email)
      .maybeSingle();
    userId = u?.id ?? null;
  }
  const { error } = await service.from('deal_participants').insert({
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
  });
  if (error) return { ok: false as const, error: error.message };
  await activity(
    a.search.id,
    a.search.firm_id,
    a.me.user_id,
    payload.role + '_added',
    payload.name || payload.email || ''
  );

  // Fire-and-forget invite email if we have an address. Pulls firm name +
  // realtor name from the search context for personalization.
  if (payload.email) {
    try {
      const { data: ctx } = await service
        .from('client_searches')
        .select(
          `name, firm:firms ( name ), realtor:users!client_searches_realtor_id_fkey ( full_name, email )`
        )
        .eq('id', a.search.id)
        .maybeSingle();
      const firmName = (ctx as any)?.firm?.name || 'a Realtor Portal firm';
      const realtorName =
        (ctx as any)?.realtor?.full_name ||
        (ctx as any)?.realtor?.email ||
        'Your realtor';
      const dealUrl =
        (process.env.SITE_URL ||
          'https://realtor-portal-ten.vercel.app') +
        '/deal/' +
        a.search.id;
      const rolePretty = payload.role.replace(/_/g, ' ');
      const safeName = escapeHtml(payload.name || payload.email);
      const safeRealtor = escapeHtml(realtorName);
      const safeFirm = escapeHtml(firmName);
      const safeRole = escapeHtml(rolePretty);
      await sendEmail({
        to: payload.email,
        subject: `${realtorName} added you to a real-estate deal at ${firmName}`,
        text:
          `${realtorName} at ${firmName} added you to a deal as ${rolePretty}.\n\n` +
          `Open the deal:\n${dealUrl}\n\n` +
          `You'll see whatever ${realtorName} chose to share with you (dates, documents, financials, messages).`,
        html: `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
            <h2 style="font-size:20px;margin:0 0 12px">You've been added to a deal</h2>
            <p>${safeRealtor} at <strong>${safeFirm}</strong> added you to a real-estate deal as <strong>${safeRole}</strong>.</p>
            <p style="margin:24px 0">
              <a href="${dealUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Open the deal →</a>
            </p>
            <p style="color:#64748B;font-size:13px">You'll see whatever ${safeRealtor} chose to share with you: important dates, documents, financials, or messages. Hi ${safeName} 👋</p>
          </div>
        `,
      });
    } catch {
      // Best-effort. Don't block the action on email failure.
    }
  }

  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true as const };
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
  return { ok: true as const, dealId: created?.id };
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
  revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true as const };
}
