import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import {
  authorizeListingDeal,
  LISTING_STATUS_VALUES,
} from '@/lib/listingApi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * LISTING UPDATE - Bearer/cookie JSON API for the native mobile app.
 * Mirrors updateListingAction in
 *   admin/app/dashboard/deals/[id]/listingActions.ts
 *
 * PATCH /api/listings/[searchId]  body {
 *   house_id,
 *   patch: { listing_status?, list_price?, mls_number?, listed_at?,
 *            commission_pct?, sold_price?, sold_at? }
 * }
 *   → { ok:true } | { ok:false, error }
 *
 * Authorize: firm staff on the deal's host firm ONLY. Phase auto-advance
 * (listing_status → deal phase) is handled by DB triggers (migration 0057);
 * this route only writes the fields.
 */

const PATCHABLE = [
  'listing_status',
  'list_price',
  'mls_number',
  'listed_at',
  'commission_pct',
  'sold_price',
  'sold_at',
] as const;

export async function PATCH(
  req: Request,
  { params }: { params: { searchId: string } }
) {
  try {
    const json = (await req.json().catch(() => ({}))) as {
      house_id?: string;
      patch?: Record<string, any>;
    };
    const houseId = String(json.house_id || '');
    const patch = json.patch || {};
    if (!houseId) {
      return NextResponse.json(
        { ok: false, error: 'A house is required.' },
        { status: 400 }
      );
    }

    const a = await authorizeListingDeal(req, params.searchId);
    if (!a.ok) {
      return NextResponse.json(
        { ok: false, error: a.error },
        { status: a.status }
      );
    }

    const update: Record<string, any> = {};
    for (const k of PATCHABLE) {
      if (k in patch) update[k] = patch[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nothing to update.' },
        { status: 400 }
      );
    }
    if (
      'listing_status' in update &&
      update.listing_status != null &&
      !LISTING_STATUS_VALUES.includes(update.listing_status)
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid listing status.' },
        { status: 400 }
      );
    }
    // When marked sold, default the sold date to today if not given
    // (same behavior as the web server action).
    if (update.listing_status === 'sold' && !update.sold_at) {
      update.sold_at = new Date().toISOString().slice(0, 10);
    }

    const service = getSupabaseServiceRoleClient();
    const { error } = await service
      .from('houses')
      .update(update)
      .eq('id', houseId)
      .eq('search_id', params.searchId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/listings/[searchId]]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
