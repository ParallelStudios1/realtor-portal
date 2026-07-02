import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { authorizeListingDeal, OFFER_STATUS_VALUES } from '@/lib/listingApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * LOG OFFER - Bearer/cookie JSON API for the native mobile app.
 * Mirrors addOfferAction in admin/app/dashboard/deals/[id]/listingActions.ts.
 *
 * POST /api/listings/[searchId]/offers  body {
 *   house_id?, buyer_name?, buyer_agent?, amount?, earnest_money?,
 *   financing?, status?, offer_date?, notes?
 * }
 *   → { ok:true, offer } | { ok:false, error }
 *
 * Seller-phase auto-advance (offer insert → offer_made) is DB trigger 0057;
 * this route only writes the row.
 */
export async function POST(
  req: Request,
  { params }: { params: { searchId: string } }
) {
  try {
    const a = await authorizeListingDeal(req, params.searchId);
    if (!a.ok) {
      return NextResponse.json(
        { ok: false, error: a.error },
        { status: a.status }
      );
    }

    const p = (await req.json().catch(() => ({}))) as Record<string, any>;
    if (p.status != null && !OFFER_STATUS_VALUES.includes(p.status)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid offer status.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data, error } = await service
      .from('listing_offers')
      .insert({
        firm_id: a.deal.firm_id,
        search_id: params.searchId,
        house_id: p.house_id || null,
        buyer_name: p.buyer_name || null,
        buyer_agent: p.buyer_agent || null,
        amount: p.amount ?? null,
        earnest_money: p.earnest_money ?? null,
        financing: p.financing || null,
        status: p.status || 'received',
        offer_date: p.offer_date || null,
        notes: p.notes || null,
        created_by: a.me.user_id,
      })
      .select(
        'id, house_id, buyer_name, buyer_agent, amount, earnest_money, financing, status, offer_date, notes, created_at'
      )
      .single();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, offer: data });
  } catch (err: any) {
    console.error('[/api/listings/[searchId]/offers]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
