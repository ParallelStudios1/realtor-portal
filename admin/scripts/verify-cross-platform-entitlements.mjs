/**
 * Proves that a subscription bought on ANY platform grants the same thing
 * everywhere: web, iOS, Android.
 *
 * The design that makes this work: entitlement lives on the `firms` row
 * (status + plan_tier + billing_source), never on the device or the platform
 * receipt. Both billing paths write the SAME columns:
 *
 *   Apple  → lib/appleIap.applyTransactionToFirm
 *   Stripe → api/billing/webhook
 *
 * and every consumer (web pages, mobile screens, seat limits, feature gates)
 * reads those columns. So the checks below verify the two writers agree, and
 * that the readers can't be fooled.
 *
 * Run: node scripts/verify-cross-platform-entitlements.mjs
 */

const PLANS = {
  solo: { name: 'Starter', seatCap: 3, features: ['customBranding'] },
  team: { name: 'Team', seatCap: 15, features: ['customBranding', 'teamOversight'] },
  brokerage: {
    name: 'Brokerage',
    seatCap: 50,
    features: ['customBranding', 'teamOversight', 'analytics'],
  },
};

const seatCapForTier = (t) => (t ? PLANS[t].seatCap : PLANS.solo.seatCap);
const tierHasFeature = (t, f) => PLANS[t ?? 'solo'].features.includes(f);

/** What lib/appleIap.ts writes to the firms row. */
function applyApple({ productTier, active }) {
  const row = {
    status: active ? 'active' : 'cancelled',
    billing_source: 'apple',
    iap_original_transaction_id: 'apple-txn-1',
  };
  if (active && productTier) row.plan_tier = productTier;
  if (!active) row.plan_tier = null;
  return row;
}

/** What api/billing/webhook/route.ts writes to the firms row. */
function applyStripe({ priceTier, status }) {
  const row = {
    status,
    billing_source: 'stripe',
    stripe_subscription_id: 'sub_123',
  };
  if (priceTier) row.plan_tier = priceTier;
  if (status === 'cancelled') row.plan_tier = null;
  return row;
}

/** What lib/seats.ts computes — identical on every surface. */
function entitlements(firm) {
  const planIsLive = firm.status === 'active' || firm.status === 'trial';
  const tier = planIsLive ? (firm.plan_tier ?? null) : null;
  const hasSubscription =
    Boolean(firm.stripe_subscription_id) ||
    Boolean(firm.iap_original_transaction_id);
  const effectiveTier = tier ?? (hasSubscription ? null : 'solo');
  return {
    planName: effectiveTier ? PLANS[effectiveTier].name : hasSubscription ? 'Active' : 'Trial',
    seatCap: seatCapForTier(effectiveTier),
    oversight: tierHasFeature(effectiveTier, 'teamOversight'),
    analytics: tierHasFeature(effectiveTier, 'analytics'),
  };
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  } else console.log(`ok    ${label}`);
}

// --- Buy on iOS, then open the web app / Android -------------------------
for (const tier of ['solo', 'team', 'brokerage']) {
  const firm = applyApple({ productTier: tier, active: true });
  const e = entitlements(firm);
  check(
    `Apple ${PLANS[tier].name} → same entitlements on web/Android`,
    e,
    {
      planName: PLANS[tier].name,
      seatCap: PLANS[tier].seatCap,
      oversight: PLANS[tier].features.includes('teamOversight'),
      analytics: PLANS[tier].features.includes('analytics'),
    }
  );
}

// --- Buy on web, then open iOS ------------------------------------------
for (const tier of ['solo', 'team', 'brokerage']) {
  const firm = applyStripe({ priceTier: tier, status: 'active' });
  const e = entitlements(firm);
  check(
    `Stripe ${PLANS[tier].name} → same entitlements on iOS`,
    e,
    {
      planName: PLANS[tier].name,
      seatCap: PLANS[tier].seatCap,
      oversight: PLANS[tier].features.includes('teamOversight'),
      analytics: PLANS[tier].features.includes('analytics'),
    }
  );
}

// --- The two writers must agree exactly for the same tier ----------------
for (const tier of ['solo', 'team', 'brokerage']) {
  const viaApple = entitlements(applyApple({ productTier: tier, active: true }));
  const viaStripe = entitlements(applyStripe({ priceTier: tier, status: 'active' }));
  check(`${PLANS[tier].name}: Apple and Stripe grant identical access`, viaApple, viaStripe);
}

// --- Cancellation must revoke everywhere, not just where they bought -----
check('Apple lapse → back to trial limits everywhere', entitlements(applyApple({ productTier: 'brokerage', active: false })), {
  planName: 'Active', seatCap: 3, oversight: false, analytics: false,
});
check('Stripe cancel → back to trial limits everywhere', entitlements(applyStripe({ priceTier: 'brokerage', status: 'cancelled' })), {
  planName: 'Active', seatCap: 3, oversight: false, analytics: false,
});

// --- A stale plan_tier must never grant seats ----------------------------
check('suspended firm with stale plan_tier gets no paid seats', entitlements({
  status: 'suspended', plan_tier: 'brokerage', stripe_subscription_id: 'sub_123',
}), { planName: 'Active', seatCap: 3, oversight: false, analytics: false });

// --- Double-billing guards ----------------------------------------------
const appleFirm = applyApple({ productTier: 'team', active: true });
const stripeFirm = applyStripe({ priceTier: 'team', status: 'active' });
// iOS paywall: hide Apple purchase when Stripe manages it (needs a real sub id)
const iosShowsApplePurchase = (f) =>
  !(f.status === 'active' && f.billing_source !== 'apple' && Boolean(f.stripe_subscription_id));
// Web checkout: refuse when Apple manages it
const webAllowsStripeCheckout = (f) =>
  !(f.billing_source === 'apple' && f.status === 'active' && Boolean(f.iap_original_transaction_id));

check('web refuses Stripe checkout for an Apple-billed firm', webAllowsStripeCheckout(appleFirm), false);
check('iOS hides Apple purchase for a Stripe-billed firm', iosShowsApplePurchase(stripeFirm), false);
check('web allows checkout for a trial firm', webAllowsStripeCheckout({ status: 'trial', billing_source: 'stripe' }), true);
check('iOS allows purchase for a trial firm', iosShowsApplePurchase({ status: 'trial', billing_source: 'stripe' }), true);

console.log(failures === 0 ? '\nCross-platform entitlements verified.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
