import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { authorizeListingDeal, OFFER_STATUS_VALUES } from '@/lib/listingApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * OFFER STATUS / DELETE - Bearer/cookie JSON API for the native mobile app.
 * Mirrors updateOfferStatusAction / deleteOfferAction in
 * admin/app/dashboard/deals/[id]/listingActions.ts.
 *
 * PATCH  /api/listings/[searchId]/offers/[offerId]  body { status }
 * DELETE /api/listings/[searchId]/offers/[offerId]
 *   → { ok:true } | { ok:false, error }
 *
 * Seller-phase auto-advance on accepted/countered is DB trigger 0057.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { searchId: string; offerId: string } }
) {
  try {
    const a = await authorizeListingDeal(req, params.searchId);
    if (!a.ok) {
      return NextResponse.json(
        { ok: false, error: a.error },
        { status: a.status }
      );
    }
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    const status = body.status || '';
    if (!OFFER_STATUS_VALUES.includes(status)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid status.' },
        { status: 400 }
      );
    }
    const service = getSupabaseServiceRoleClient();
    const { error } = await service
      .from('listing_offers')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', params.offerId)
      .eq('search_id', params.searchId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/listings/offers PATCH]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { searchId: string; offerId: string } }
) {
  try {
    const a = await authorizeListingDeal(req, params.searchId);
    if (!a.ok) {
      return NextResponse.json(
        { ok: false, error: a.error },
        { status: a.status }
      );
    }
    const service = getSupabaseServiceRoleClient();
    const { error } = await service
      .from('listing_offers')
      .delete()
      .eq('id', params.offerId)
      .eq('search_id', params.searchId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/listings/offers DELETE]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
