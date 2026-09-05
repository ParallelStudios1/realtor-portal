import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { resolveCaller, isFirmAdmin } from '@/lib/bearerAuth';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/fmls-checkout — buy the FMLS integration add-on.
 *
 * Deliberate differences from the plan checkout:
 *  - FIRM-LEVEL: one subscription covers the whole firm (a solo agent is a
 *    firm of one, so "broker level" and "solo" are the same mechanics).
 *  - NO FREE TRIAL and NO launch coupon: FMLS charges us per subscriber from
 *    day one, so this is never discounted or free.
 *  - SEPARATE Stripe subscription tagged metadata.addon='fmls' so the webhook
 *    can never confuse it with the firm's plan.
 *  - Admin-only: the firm admin (or law-firm attorney) buys it for the firm.
 *
 * Price comes from STRIPE_PRICE_FMLS so the amount can be set in the Stripe
 * dashboard once FMLS's fee schedule is final, without a deploy.
 */
export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    if (!isFirmAdmin(me.role, me.firm_type)) {
      return NextResponse.json(
        { error: 'Only a firm admin can add the FMLS integration.' },
        { status: 403 }
      );
    }

    const priceId = process.env.STRIPE_PRICE_FMLS;
    if (!priceId) {
      return NextResponse.json(
        { error: 'The FMLS add-on is not accepting payments yet.' },
        { status: 400 }
      );
    }
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || !/^sk_(test|live)_/.test(stripeKey)) {
      return NextResponse.json(
        { error: 'Stripe is not configured on the server.' },
        { status: 500 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data: firm } = await service
      .from('firms')
      .select('id, name, contact_email, stripe_customer_id, fmls_active')
      .eq('id', me.firm_id)
      .single();
    if (!firm) {
      return NextResponse.json({ error: 'Firm not found.' }, { status: 404 });
    }
    if ((firm as any).fmls_active) {
      return NextResponse.json(
        { error: 'Your firm already has the FMLS integration.' },
        { status: 409 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtorportal.parallelstudios.co';

    let customerId = (firm as any).stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (firm as any).contact_email || me.email || undefined,
        name: (firm as any).name,
        metadata: { firm_id: me.firm_id },
      });
      customerId = customer.id;
      await service
        .from('firms')
        .update({ stripe_customer_id: customerId })
        .eq('id', me.firm_id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/billing?fmls=1`,
      cancel_url: `${baseUrl}/dashboard/billing?fmls_canceled=1`,
      metadata: { addon: 'fmls', firm_id: me.firm_id },
      subscription_data: {
        metadata: { addon: 'fmls', firm_id: me.firm_id },
      },
      // Deliberately: no trial_period_days, no discounts, no promo codes.
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    const message = err?.raw?.message || err?.message || 'Unexpected error.';
    console.error('[/api/billing/fmls-checkout]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
