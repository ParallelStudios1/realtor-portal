'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

/**
 * Client-side action: client requests a tour for a specific house.
 *
 * Verifies the caller is a client AND the house belongs to one of their
 * client_searches before inserting. Returns { ok, error?, tourId? }.
 */
export async function requestTourAction(
  houseId: string,
  payload: { requested_at?: string; preferred_when?: string; notes?: string }
) {
  const me = await getMe();
  if (!me?.user_id) return { ok: false as const, error: 'Not authenticated.' };
  if (me.role !== 'client')
    return { ok: false as const, error: 'Only clients can request tours.' };

  // A concrete date AND time is required — no time, no tour request.
  const requestedAt = payload.requested_at ? new Date(payload.requested_at) : null;
  if (!requestedAt || isNaN(requestedAt.getTime())) {
    return {
      ok: false as const,
      error: 'Pick a date and time for the tour.',
    };
  }

  const service = getSupabaseServiceRoleClient();

  // Resolve the house's search and confirm it belongs to this client.
  const { data: house } = await service
    .from('houses')
    .select('id, firm_id, search_id')
    .eq('id', houseId)
    .maybeSingle();
  if (!house) return { ok: false as const, error: 'House not found.' };

  const { data: search } = await service
    .from('client_searches')
    .select('id, client_id, realtor_id')
    .eq('id', house.search_id)
    .maybeSingle();
  if (!search || search.client_id !== me.user_id)
    return { ok: false as const, error: 'Not your house.' };

  // Idempotency: if there's already a pending tour for this client+house,
  // just return it instead of stacking duplicates.
  const { data: existing } = await service
    .from('tour_requests')
    .select('id')
    .eq('house_id', houseId)
    .eq('client_id', me.user_id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return { ok: true as const, tourId: existing.id, duplicate: true };
  }

  const { data: created, error } = await service
    .from('tour_requests')
    .insert({
      firm_id: house.firm_id,
      search_id: house.search_id,
      house_id: houseId,
      client_id: me.user_id,
      status: 'pending',
      requested_at: requestedAt.toISOString(),
      preferred_when: payload.preferred_when || null,
      notes: payload.notes || null,
    })
    .select('id')
    .single();
  if (error) return { ok: false as const, error: error.message };

  // Activity row so the realtor's view updates.
  await service.from('activities').insert({
    firm_id: house.firm_id,
    search_id: house.search_id,
    actor_id: me.user_id,
    action: 'tour_requested',
    target: houseId,
    metadata: { preferred_when: payload.preferred_when },
  });

  // Push to the realtor side (best effort).
  try {
    const base = process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
    await fetch(base + '/api/notifications/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        searchId: house.search_id,
        kind: 'tour_request',
      }),
    });
  } catch {}

  revalidatePath(`/client/houses/${houseId}`);
  return { ok: true as const, tourId: created?.id };
}

/**
 * CLIENT ↔ REALTOR HOUSE AGREEMENT — client side.
 *
 * The principal client marks "This is the house I want" on a specific house.
 * Sets client_searches.offer_house_id = that house, house_agreed_at = now(),
 * house_agreed_by = the client's user id, writes an activity row, and
 * best-effort notifies the realtor. Guard: only the PRINCIPAL client of the
 * deal that owns this house can do this, and only on their own deal.
 */
export async function markAgreedHouseAction(houseId: string) {
  const me = await getMe();
  if (!me?.user_id) return { ok: false as const, error: 'Not authenticated.' };
  if (me.role !== 'client')
    return { ok: false as const, error: 'Only the client can pick the home.' };

  const service = getSupabaseServiceRoleClient();

  // Resolve the house's search and confirm it belongs to this client.
  const { data: house } = await service
    .from('houses')
    .select('id, firm_id, search_id, address')
    .eq('id', houseId)
    .maybeSingle();
  if (!house) return { ok: false as const, error: 'House not found.' };

  const { data: search } = await service
    .from('client_searches')
    .select('id, firm_id, client_id, realtor_id')
    .eq('id', (house as any).search_id)
    .maybeSingle();
  if (!search || (search as any).client_id !== me.user_id)
    return { ok: false as const, error: 'Not your house.' };

  // The client PROPOSES the home; the realtor confirms it (which then agrees
  // it + advances the deal to awaiting_offer). We record a pending proposal.
  const { error } = await service
    .from('client_searches')
    .update({
      house_proposed_house_id: houseId,
      house_proposed_by: me.user_id,
      house_proposed_at: new Date().toISOString(),
    })
    .eq('id', (search as any).id);
  if (error) return { ok: false as const, error: error.message };

  await service.from('activities').insert({
    firm_id: (house as any).firm_id,
    search_id: (search as any).id,
    actor_id: me.user_id,
    action: 'house_proposed',
    target: (house as any).address || houseId,
    metadata: { house_id: houseId, by: 'client' },
  });

  // Best-effort: notify the realtor that the client picked the home.
  try {
    const { data: realtor } = (search as any).realtor_id
      ? await service
          .from('users')
          .select('email, phone, full_name')
          .eq('id', (search as any).realtor_id)
          .maybeSingle()
      : { data: null };
    const siteUrl =
      process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
    const dealUrl = siteUrl + '/dashboard/deals/' + (search as any).id;
    const addr = (house as any).address || 'a home';
    const clientName = me.full_name || 'Your client';
    if ((realtor as any)?.email || (realtor as any)?.phone) {
      await notify({
        email: (realtor as any)?.email || null,
        phone: (realtor as any)?.phone || null,
        subject: 'Action needed: ' + clientName + ' picked a home — ' + addr,
        text:
          clientName +
          ' said this is the home they want:\n\n' +
          addr +
          '\n\nConfirm it on the deal to lock it in and move to Awaiting offer:\n' +
          dealUrl,
        html: `<p><strong>${escapeHtml(
          clientName
        )}</strong> said this is the home they want:</p><p><strong>${escapeHtml(
          addr
        )}</strong></p><p>Confirm it on the deal to lock it in and move to <em>Awaiting offer</em>:</p><p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
        sms_text:
          clientName + ' picked a home: ' + addr + '. Confirm it: ' + dealUrl,
      });
    }
  } catch (e: any) {
    console.error('[markAgreedHouseAction] notify failed', e?.message || e);
  }

  // Push to the realtor side (best effort).
  try {
    const base = process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
    await fetch(base + '/api/notifications/send-push', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        searchId: (search as any).id,
        kind: 'house_agreed',
      }),
    });
  } catch {}

  revalidatePath(`/client/houses/${houseId}`);
  revalidatePath('/client/houses');
  revalidatePath('/client');
  return { ok: true as const };
}
