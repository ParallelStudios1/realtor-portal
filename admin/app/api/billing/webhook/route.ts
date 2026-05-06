import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

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
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook is not configured.' },
      { status: 500 }
    );
  }

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
          await service
            .from('firms')
            .update({
              status: 'active',
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId,
            })
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
        await service
          .from('firms')
          .update({ status, stripe_subscription_id: sub.id })
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
