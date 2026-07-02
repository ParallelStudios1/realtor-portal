import { resolveCaller, type Caller } from './bearerAuth';
import { getSupabaseServiceRoleClient } from './supabaseServer';

/**
 * Shared auth + constants for the /api/listings/* Bearer routes (mobile
 * parity with the SellerListingPanel server actions in
 * admin/app/dashboard/deals/[id]/listingActions.ts).
 *
 * Keep the value lists in lockstep with:
 *   - houses.listing_status comment / web LISTING_STATUSES (migration 0047)
 *   - listing_offers.status CHECK constraint (migration 0047)
 */

export const LISTING_STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
];

export const LISTING_STATUS_VALUES = [
  'coming_soon',
  'active',
  'under_contract',
  'pending',
  'sold',
  'withdrawn',
];

export const OFFER_STATUS_VALUES = [
  'received',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
];

export type ListingDealAuth =
  | { ok: true; me: Caller; deal: { id: string; firm_id: string } }
  | { ok: false; error: string; status: number };

/**
 * Resolve the caller (cookie or Bearer) and authorize them as firm staff on
 * the deal's host firm - the exact rule listingActions.ts enforces.
 */
export async function authorizeListingDeal(
  req: Request,
  searchId: string
): Promise<ListingDealAuth> {
  const me = await resolveCaller(req);
  if (!me?.user_id)
    return { ok: false, error: 'Not authenticated.', status: 401 };
  if (!LISTING_STAFF_ROLES.includes(me.role || ''))
    return {
      ok: false,
      error: 'Only firm staff can manage listings.',
      status: 403,
    };

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id')
    .eq('id', searchId)
    .maybeSingle();
  if (!deal) return { ok: false, error: 'Deal not found.', status: 404 };
  if ((deal as any).firm_id !== me.firm_id)
    return { ok: false, error: 'You are not on this deal.', status: 403 };

  return { ok: true, me, deal: deal as { id: string; firm_id: string } };
}
