'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

type Svc = ReturnType<typeof getSupabaseServiceRoleClient>;

const TERMINATION_REASONS = [
  'inspection',
  'financing',
  'appraisal',
  'title',
  'buyer_withdrew',
  'seller_withdrew',
  'mutual',
  'other',
] as const;

const REASON_LABEL: Record<string, string> = {
  inspection: 'inspection',
  financing: 'financing',
  appraisal: 'appraisal',
  title: 'title issue',
  buyer_withdrew: 'buyer withdrew',
  seller_withdrew: 'seller withdrew',
  mutual: 'mutual agreement',
  other: 'other',
};

/**
 * Revert ONE deal to its pre-contract state. Buyers go back to "searching"
 * (they keep all their houses/docs/parties); sellers go back to
 * "awaiting_offer" (their listing goes active again). We clear the
 * contract-specific fields and flip the under-contract house back, but keep
 * everything else (houses, documents, parties, messages) intact.
 */
async function resetOneDeal(
  service: Svc,
  deal: { id: string; firm_id: string; kind: string | null },
  reason: string,
  actorId: string
) {
  const isSeller = deal.kind === 'seller';
  const newPhase = isSeller ? 'awaiting_offer' : 'searching';
  const note = isSeller
    ? `Back on market - last deal fell through (${REASON_LABEL[reason] || reason})`
    : `Back to searching - deal fell through (${REASON_LABEL[reason] || reason})`;

  await service
    .from('client_searches')
    .update({
      phase: newPhase,
      subphase: note,
      offer_house_id: null,
      house_agreed_at: null,
      house_agreed_by: null,
      house_proposed_house_id: null,
      house_proposed_by: null,
      house_proposed_at: null,
      offer_amount: null,
      counter_offer_amount: null,
      closing_date: null,
      closing_amount: null,
      contract_url: null,
      contract_signed_at: null,
    })
    .eq('id', deal.id);

  // Flip any under-contract house on this deal back to available. For a seller
  // listing, set the listing status back to active and clear the sale fields.
  await service
    .from('houses')
    .update({
      is_under_contract: false,
      ...(isSeller
        ? { listing_status: 'active', sold_price: null, sold_at: null }
        : {}),
    })
    .eq('search_id', deal.id);

  await service.from('activities').insert({
    firm_id: deal.firm_id,
    search_id: deal.id,
    actor_id: actorId,
    action: 'deal_fell_through',
    target: REASON_LABEL[reason] || reason,
    metadata: { reason, reverted_to: newPhase },
  });
}

/**
 * Terminate / "fell through" a deal. Reverts THIS deal and - if it's a
 * two-sided (buyer↔seller) transaction - the linked counterpart too, then
 * unlinks the two sides so each is independent again. Nothing is deleted; the
 * listing goes back on the market and the buyer goes back to searching.
 *
 * Authorized to host-firm staff.
 */
export async function terminateDealAction(fd: FormData) {
  const me = await getMe();
  if (!me?.user_id || !me.firm_id)
    return { ok: false as const, error: 'Not signed in.' };

  const searchId = (fd.get('search_id') as string) || '';
  const reason = (fd.get('reason') as string) || 'other';
  if (!searchId) return { ok: false as const, error: 'Missing deal.' };
  const safeReason = (TERMINATION_REASONS as readonly string[]).includes(reason)
    ? reason
    : 'other';

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id, kind')
    .eq('id', searchId)
    .maybeSingle();
  if (!deal) return { ok: false as const, error: 'Deal not found.' };

  const isStaff =
    (deal as any).firm_id === me.firm_id &&
    ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'].includes(
      me.role || ''
    );
  if (!isStaff) {
    return {
      ok: false as const,
      error: 'Only the firm managing this deal can terminate it.',
    };
  }

  const d = deal as { id: string; firm_id: string; kind: string | null };

  // Reset this deal.
  await resetOneDeal(service, d, safeReason, me.user_id);

  // Find + reset the linked counterpart, then sever the link.
  // (a) This deal's houses point at a seller listing deal (buyer→seller link).
  const { data: outboundHouses } = await service
    .from('houses')
    .select('id, listing_search_id')
    .eq('search_id', d.id)
    .not('listing_search_id', 'is', null);
  const counterpartIds = new Set<string>();
  for (const h of (outboundHouses || []) as any[]) {
    if (h.listing_search_id) counterpartIds.add(h.listing_search_id);
  }
  // (b) Other deals' houses point at THIS deal (seller→buyer link).
  const { data: inboundHouses } = await service
    .from('houses')
    .select('id, search_id')
    .eq('listing_search_id', d.id);
  for (const h of (inboundHouses || []) as any[]) {
    if (h.search_id) counterpartIds.add(h.search_id);
  }

  for (const cid of counterpartIds) {
    if (cid === d.id) continue;
    const { data: cp } = await service
      .from('client_searches')
      .select('id, firm_id, kind')
      .eq('id', cid)
      .maybeSingle();
    if (cp) {
      await resetOneDeal(
        service,
        cp as { id: string; firm_id: string; kind: string | null },
        safeReason,
        me.user_id
      );
      revalidatePath('/dashboard/deals/' + cid);
    }
  }

  // Sever both link directions so the two sides are independent again.
  await service
    .from('houses')
    .update({ listing_search_id: null })
    .eq('search_id', d.id)
    .not('listing_search_id', 'is', null);
  await service
    .from('houses')
    .update({ listing_search_id: null })
    .eq('listing_search_id', d.id);

  revalidatePath('/dashboard/deals/' + d.id);
  revalidatePath('/client');
  revalidatePath('/deal/' + d.id);
  return { ok: true as const, kind: d.kind, counterparts: counterpartIds.size };
}
