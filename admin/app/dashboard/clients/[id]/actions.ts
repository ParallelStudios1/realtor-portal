'use server';

import { revalidatePath } from 'next/cache';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

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
    kind: payload.kind ?? 'custom',
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
