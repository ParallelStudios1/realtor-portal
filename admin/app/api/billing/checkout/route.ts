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
 * checkout URL that we redirect the user to. After payment, Stripe sends a
 * webhook to /api/billing/webhook which flips the firm to status='active'.
 */
export async function POST(req: Request) {
  const me = await getMe();
  if (!me?.firm_id) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan;

  const priceMap: Record<string, string | undefined> = {
    solo: process.env.STRIPE_PRICE_SOLO,
    team: process.env.STRIPE_PRICE_TEAM,
    brokerage: process.env.STRIPE_PRICE_BROKERAGE,
  };
  const priceId = plan ? priceMap[plan] : undefined;
  if (!priceId) {
    return NextResponse.json(
      { error: 'Invalid plan or Stripe price not configured.' },
      { status: 400 }
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  // Look up or create a Stripe customer for this firm
  const service = getSupabaseServiceRoleClient();
  const { data: firm } = await service
    .from('firms')
    .select('id, name, contact_email, stripe_customer_id')
    .eq('id', me.firm_id)
    .single();

  let stripeCustomerId = (firm as any)?.stripe_customer_id as string | undefined;
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

  return NextResponse.json({ url: session.url });
}
