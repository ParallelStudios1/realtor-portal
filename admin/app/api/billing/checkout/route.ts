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

  // Hardcoded fallbacks so this works even without env vars set.
  // Override in Vercel env vars when ready (env vars take precedence).
  const PRICE_FALLBACKS = {
    solo: 'price_1TUXB4E4f1D9W7YWV6x21nCU',       // $99/mo
    team: 'price_1TUXB8E4f1D9W7YWhmNaJize',       // $299/mo
    brokerage: 'price_1TUFlsE4f1D9W7YWXviZUzol',  // $799/mo
  };

  const priceMap: Record<string, string | undefined> = {
    solo: process.env.STRIPE_PRICE_SOLO ?? PRICE_FALLBACKS.solo,
    team: process.env.STRIPE_PRICE_TEAM ?? PRICE_FALLBACKS.team,
    brokerage: process.env.STRIPE_PRICE_BROKERAGE ?? PRICE_FALLBACKS.brokerage,
  };
  const priceId = plan ? priceMap[plan] : undefined;
  if (!priceId) {
    return NextResponse.json(
      { error: 'Invalid plan.' },
      { status: 400 }
    );
  }

  const stripeKey =
    process.env.STRIPE_SECRET_KEY ?? 'mk_1S318YE4f1D9W7YW7ixn92Fe';

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://realtor-portal-ten.vercel.app';

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
