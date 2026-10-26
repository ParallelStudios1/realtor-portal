import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { tierFromPriceId } from '@/lib/plans';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
// Stripe sends raw body - Next App Router needs this to skip body parsing.
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
        // FMLS add-on: a SEPARATE subscription. It must never touch the
        // firm's plan fields — it only flips the add-on flag.
        if (session.metadata?.addon === 'fmls') {
          if (subscriptionId && customerId) {
            const { data: fmlsFirm } = await service
              .from('firms')
              .update({
                fmls_active: true,
                fmls_stripe_subscription_id: subscriptionId,
                fmls_activated_at: new Date().toISOString(),
              })
              .eq('stripe_customer_id', customerId)
              .select('id, name, contact_email, fmls_member_id')
              .maybeSingle();
            // Fully automatic registration flow — nothing manual for anyone
            // on our side. FMLS requires (1) the VENDOR to tell data@fmls.com
            // who to add, THEN (2) the member subscribes in the Marketplace.
            // So on purchase we email FMLS the add request, tell the buyer
            // what happens next, and email ourselves the record.
            try {
              const f = fmlsFirm as any;
              const memberId =
                session.metadata?.fmls_member_id || f?.fmls_member_id || '';
              // (1) Vendor → FMLS: request the member be added so they can
              // subscribe to our Marketplace product.
              await notify({
                email: 'data@fmls.com',
                subject: 'Realtor Portal — please add a member subscriber',
                text:
                  `Hello,\n\n` +
                  `A new firm has purchased the FMLS integration for our Marketplace product "Realtor Portal" (vendor: Parallel Studios). Please add the following member so they can subscribe:\n\n` +
                  `FMLS agent/office ID: ${memberId || 'not provided - we will follow up'}\n` +
                  `Firm name: ${f?.name ?? 'unknown'}\n` +
                  `Contact email: ${f?.contact_email ?? 'unknown'}\n\n` +
                  `Once added, we will direct them to subscribe via Data Marketplace > Browse Products > Realtor Portal.\n\n` +
                  `Thank you!\nParallel Studios LLC · turnerlogan@parallelstudios.co · (678) 822-6564`,
              });
              // (2) Buyer: explain the two-step FMLS side in the right order.
              if (f?.contact_email) {
                await notify({
                  email: f.contact_email,
                  subject: 'FMLS integration is on — one FMLS step to finish',
                  text:
                    `Your FMLS integration for ${f.name} is active in Realtor Portal - you can start using FMLS listing autofill right away.\n\n` +
                    `To complete your authorization on FMLS's side, we've asked FMLS to register you as a subscriber (this usually takes about a business day). Once FMLS confirms, sign in at fmls.com, go to Data Marketplace > Browse Products, find "Realtor Portal" and press Subscribe. FMLS requires this registration for every member using FMLS data in a third-party product.\n\n` +
                    `Questions? Just reply to this email.`,
                });
              }
              // (3) Ourselves: the full record.
              await notify({
                email: 'turnerlogan@parallelstudios.co',
                subject: `FMLS add-on purchased: ${f?.name ?? customerId}`,
                text:
                  `Firm: ${f?.name ?? '?'} (${f?.id ?? '?'})\n` +
                  `FMLS member ID: ${memberId || 'not provided'}\n` +
                  `Contact: ${f?.contact_email ?? '?'}\n` +
                  `Stripe sub: ${subscriptionId}\n\n` +
                  `data@fmls.com was automatically asked to add this member, and the buyer was told to subscribe in the Marketplace once FMLS confirms. Watch for FMLS's "new subscriber" email; no action needed unless FMLS replies with questions.`,
              });
            } catch (e) {
              console.error('[webhook] fmls notify failed', e);
            }
          }
          break;
        }
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
            // Claim billing for Stripe. Without this a firm that previously
            // subscribed through Apple would keep billing_source='apple', and
            // the iOS paywall would offer an Apple plan on top of the web one.
            billing_source: 'stripe',
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
        if (sub.metadata?.addon === 'fmls') {
          const on = sub.status === 'active' || sub.status === 'trialing';
          await service
            .from('firms')
            .update({ fmls_active: on, fmls_stripe_subscription_id: sub.id })
            .eq('stripe_customer_id', sub.customer as string);
          break;
        }
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
          billing_source: 'stripe',
        };
        if (planTier) update.plan_tier = planTier;
        // Losing the subscription must also drop the tier, or a cancelled firm
        // keeps the seat cap and features it no longer pays for. Mirrors the
        // Apple path in lib/appleIap.ts.
        if (status === 'cancelled') update.plan_tier = null;

        await service
          .from('firms')
          .update(update)
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        if (sub.metadata?.addon === 'fmls') {
          await service
            .from('firms')
            .update({ fmls_active: false })
            .eq('stripe_customer_id', sub.customer as string);
          break;
        }
        await service
          .from('firms')
          // Clear the tier too: entitlements fall back to trial limits rather
          // than leaving a cancelled firm on a paid seat cap.
          .update({ status: 'cancelled', plan_tier: null })
          .eq('stripe_customer_id', sub.customer as string);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // A failed ADD-ON invoice must not suspend the whole firm — it only
        // turns the add-on off. Match against the stored add-on sub id.
        const subId = (invoice as any).subscription as string | null;
        if (subId) {
          const { data: addonFirm } = await service
            .from('firms')
            .select('id')
            .eq('fmls_stripe_subscription_id', subId)
            .maybeSingle();
          if (addonFirm) {
            await service
              .from('firms')
              .update({ fmls_active: false })
              .eq('id', (addonFirm as any).id);
            break;
          }
        }
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
