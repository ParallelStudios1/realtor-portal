import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/fmls/availability — is the FMLS add-on purchasable yet?
 *
 * Sales stay OFF until FMLS approves the product; then flipping two env vars
 * turns both storefronts on with no deploy:
 *   STRIPE_PRICE_FMLS  → web/Android checkout goes live
 *   FMLS_IOS_SALES=1   → the iOS in-app purchase button appears
 * The lookup entitlement gate is separate — a firm that already has
 * fmls_active keeps working regardless of this flag.
 */
export async function GET() {
  return NextResponse.json({
    web: Boolean(process.env.STRIPE_PRICE_FMLS),
    ios: process.env.FMLS_IOS_SALES === '1',
    ios_product_id: 'com.parallelstudios.realtorportal.fmls.monthly',
  });
}
