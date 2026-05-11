'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Client-side action: client requests a tour for a specific house.
 *
 * Verifies the caller is a client AND the house belongs to one of their
 * client_searches before inserting. Returns { ok, error?, tourId? }.
 */
export async function requestTourAction(
  houseId: string,
  payload: { preferred_when?: string; notes?: string }
) {
  const me = await getMe();
  if (!me?.user_id) return { ok: false as const, error: 'Not authenticated.' };
  if (me.role !== 'client')
    return { ok: false as const, error: 'Only clients can request tours.' };

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
    const base = process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app';
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
