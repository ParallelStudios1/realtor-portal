import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * POST /api/billing/checkout
 * Body: { plan: 'solo' | 'team' | 'brokerage' }
 *
 * Creates a Stripe Checkout session for the current firm. Returns a hosted
 * checkout URL. After payment, Stripe sends a webhook to /api/billing/webhook
 * which flips the firm to status='active'.
 *
 * Always returns JSON, even on errors, so the client never hits
 * "JSON.parse: unexpected end of data".
 */
export async function POST(req: Request) {
  try {
    const me = await getMe();
    if (!me?.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { plan?: string };
    const plan = body.plan;

    // Live Stripe price IDs (Parallel Studios LLC account).
    // Override via env vars in Vercel if you ever rotate them.
    const PRICE_FALLBACKS = {
      solo: 'price_1TUXB4E4f1D9W7YWV6x21nCU', // $99/mo
      team: 'price_1TUXB8E4f1D9W7YWhmNaJize', // $299/mo
      brokerage: 'price_1TUFlsE4f1D9W7YWXviZUzol', // $799/mo
    };

    const priceMap: Record<string, string | undefined> = {
      solo: process.env.STRIPE_PRICE_SOLO ?? PRICE_FALLBACKS.solo,
      team: process.env.STRIPE_PRICE_TEAM ?? PRICE_FALLBACKS.team,
      brokerage:
        process.env.STRIPE_PRICE_BROKERAGE ?? PRICE_FALLBACKS.brokerage,
    };
    const priceId = plan ? priceMap[plan] : undefined;
    if (!priceId) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    // Validate the Stripe secret key BEFORE we try to use it. A real Stripe
    // secret key starts with "sk_test_" or "sk_live_". Anything else is a
    // placeholder and will throw an opaque error on the first API call.
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || !/^sk_(test|live)_/.test(stripeKey)) {
      return NextResponse.json(
        {
          error:
            'Stripe is not configured on the server. Add a real STRIPE_SECRET_KEY (sk_test_… or sk_live_…) to your environment.',
        },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtorportal.parallelstudios.co';

    // Look up or create a Stripe customer for this firm
    const service = getSupabaseServiceRoleClient();
    const { data: firm, error: firmErr } = await service
      .from('firms')
      .select('id, name, contact_email, stripe_customer_id')
      .eq('id', me.firm_id)
      .single();

    if (firmErr || !firm) {
      return NextResponse.json(
        { error: 'Could not find your firm record. Please sign out and back in.' },
        { status: 404 }
      );
    }

    let stripeCustomerId = (firm as any)?.stripe_customer_id as
      | string
      | undefined;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: (firm?.contact_email as string) || me.email,
        name: firm?.name as string,
        metadata: { firm_id: me.firm_id },
      });
      stripeCustomerId = customer.id;
      await service
        .from('firms')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', me.firm_id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/billing?success=1`,
      cancel_url: `${baseUrl}/dashboard/billing?canceled=1`,
      subscription_data: {
        metadata: { firm_id: me.firm_id },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    // Never let an unhandled exception turn into an empty 500 body —
    // that's what causes "JSON.parse: unexpected end of data" on the client.
    const message =
      err?.raw?.message || err?.message || 'Unexpected server error.';
    console.error('[/api/billing/checkout] ', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
