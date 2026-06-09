'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * LISTING + OFFERS server actions for seller deals.
 *
 * Listing agents manage the property they're selling (status, price, MLS,
 * list/sold dates) and track offers received from buyers. All actions are
 * firm-staff-authorized against the deal's host firm.
 */

const STAFF = ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'];

async function authorizeDeal(searchId: string) {
  const me = await getMe();
  if (!me?.user_id) return { error: 'Not signed in.' as const };
  if (!STAFF.includes(me.role || ''))
    return { error: 'Only firm staff can manage listings.' as const };
  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id')
    .eq('id', searchId)
    .maybeSingle();
  if (!deal) return { error: 'Deal not found.' as const };
  if ((deal as any).firm_id !== me.firm_id)
    return { error: 'You are not on this deal.' as const };
  return { me, deal: deal as { id: string; firm_id: string } };
}

export async function updateListingAction(
  searchId: string,
  houseId: string,
  patch: {
    listing_status?: string | null;
    list_price?: number | null;
    mls_number?: string | null;
    listed_at?: string | null;
    commission_pct?: number | null;
    sold_price?: number | null;
    sold_at?: string | null;
  }
) {
  const a = await authorizeDeal(searchId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();

  const update: Record<string, any> = {};
  for (const k of [
    'listing_status',
    'list_price',
    'mls_number',
    'listed_at',
    'commission_pct',
    'sold_price',
    'sold_at',
  ] as const) {
    if (k in patch) update[k] = (patch as any)[k];
  }
  // When marked sold, default the sold date to today if not given.
  if (update.listing_status === 'sold' && !update.sold_at) {
    update.sold_at = new Date().toISOString().slice(0, 10);
  }

  const { error } = await service
    .from('houses')
    .update(update)
    .eq('id', houseId)
    .eq('search_id', searchId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/deals/' + searchId);
  revalidatePath('/deal/' + searchId);
  return { ok: true as const };
}

export async function addOfferAction(
  searchId: string,
  payload: {
    house_id?: string | null;
    buyer_name?: string | null;
    buyer_agent?: string | null;
    amount?: number | null;
    earnest_money?: number | null;
    financing?: string | null;
    status?: string | null;
    offer_date?: string | null;
    notes?: string | null;
  }
) {
  const a = await authorizeDeal(searchId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();

  const { data, error } = await service
    .from('listing_offers')
    .insert({
      firm_id: a.deal.firm_id,
      search_id: searchId,
      house_id: payload.house_id || null,
      buyer_name: payload.buyer_name || null,
      buyer_agent: payload.buyer_agent || null,
      amount: payload.amount ?? null,
      earnest_money: payload.earnest_money ?? null,
      financing: payload.financing || null,
      status: payload.status || 'received',
      offer_date: payload.offer_date || null,
      notes: payload.notes || null,
      created_by: a.me.user_id,
    })
    .select(
      'id, house_id, buyer_name, buyer_agent, amount, earnest_money, financing, status, offer_date, notes, created_at'
    )
    .single();
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/dashboard/deals/' + searchId);
  return { ok: true as const, offer: data };
}

export async function updateOfferStatusAction(
  searchId: string,
  offerId: string,
  status: string
) {
  const a = await authorizeDeal(searchId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const allowed = ['received', 'countered', 'accepted', 'rejected', 'withdrawn'];
  if (!allowed.includes(status))
    return { ok: false as const, error: 'Invalid status.' };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('listing_offers')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .eq('search_id', searchId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/deals/' + searchId);
  return { ok: true as const };
}

export async function deleteOfferAction(searchId: string, offerId: string) {
  const a = await authorizeDeal(searchId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('listing_offers')
    .delete()
    .eq('id', offerId)
    .eq('search_id', searchId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/deals/' + searchId);
  return { ok: true as const };
}
