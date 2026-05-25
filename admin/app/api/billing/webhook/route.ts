import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { tierFromPriceId } from '@/lib/plans';

export const runtime = 'nodejs';
// Stripe sends raw body — Next App Router needs this to skip body parsing.
export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/webhook
 * Stripe-signed events. Handles:
 *   checkout.session.completed         → mark firm active, store subscription_id
 *   customer.subscription.updated      → reflect status changes
 *   customer.subscription.deleted      → mark firm cancelled
 *   invoice.payment_failed             → mark firm past_due
 *
 * To set up:
 *   1. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel env vars
 *   2. In Stripe dashboard, create a webhook endpoint pointing to
 *      https://your-vercel-url/api/billing/webhook
 *      and subscribe to the events listed above
 *   3. Copy the webhook signing secret into STRIPE_WEBHOOK_SECRET
 */
export async function POST(req: Request) {
  const stripeKey =
    process.env.STRIPE_SECRET_KEY ?? 'mk_1S318YE4f1D9W7YW7ixn92Fe';
  const webhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET ??
    'whsec_BDWbdcUTQY7LFeMoUsMLHhjJwBO3TKtt';

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  const service = getSupabaseServiceRoleClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription as string | null;
        const customerId = session.customer as string | null;
        if (subscriptionId && customerId) {
          // Re-fetch the session with line_items expanded so we can read
          // which Stripe price (and therefore which plan tier) was bought.
          // The webhook payload doesn't include line_items by default.
          let planTier: string | null = null;
          try {
            const full = await stripe.checkout.sessions.retrieve(session.id, {
              expand: ['line_items.data.price'],
            });
            const priceId =
              (full.line_items?.data?.[0]?.price?.id as string | undefined) ?? null;
            planTier = tierFromPriceId(priceId);
          } catch (err) {
            console.error('Failed to expand checkout line_items:', err);
          }

          const update: Record<string, any> = {
            status: 'active',
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
          };
          if (planTier) update.plan_tier = planTier;

          await service
            .from('firms')
            .update(update)
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const status =
          sub.status === 'active' || sub.status === 'trialing'
            ? 'active'
            : sub.status === 'past_due' || sub.status === 'unpaid'
              ? 'suspended'
              : sub.status === 'canceled'
                ? 'cancelled'
                : 'active';

        // Pull the active price id off the subscription so plan changes
        // (upgrades / downgrades) are reflected in firms.plan_tier.
        const priceId =
          (sub.items?.data?.[0]?.price?.id as string | undefined) ?? null;
        const planTier = tierFromPriceId(priceId);

        const update: Record<string, any> = {
          status,
          stripe_subscription_id: sub.id,
        };
        if (planTier) update.plan_tier = planTier;

        await service
          .from('firms')
          .update(update)
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await service
          .from('firms')
          .update({ status: 'cancelled' })
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await service
          .from('firms')
          .update({ status: 'suspended' })
          .eq('stripe_customer_id', invoice.customer as string);
        break;
      }

      default:
        // ignore unrelated events
        break;
    }
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
