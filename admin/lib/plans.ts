export type PlanTier = 'solo' | 'team' | 'brokerage' | 'attorney';

/**
 * Real, enforceable feature flags per tier. These gate actual pages/actions
 * (not just marketing copy), so a higher tier unlocks capabilities a lower
 * tier genuinely cannot use:
 *   - teamOversight  → /dashboard/oversight (firm-wide deadline oversight)
 *   - analytics      → /dashboard/analytics (firm-wide performance analytics)
 *   - customBranding → firm logo/colors/tagline on the portal + mobile app
 */
export type PlanFeature = 'customBranding' | 'teamOversight' | 'analytics';

/**
 * Seat caps MUST match what we advertise on the App Store product pages
 * ("up to 3 / 15 / 50 agents"). Apple reviews against the described offering,
 * and more importantly a customer who pays for 50 seats has to actually get
 * 50 seats.
 */
export const PLANS = {
  solo: {
    name: 'Starter',
    price: 99,
    seatCap: 3,
    priceId: 'price_1TUXB4E4f1D9W7YWV6x21nCU',
    appleProductId: 'com.parallelstudios.realtorportal.starter.monthly',
    features: ['customBranding'] as PlanFeature[],
  },
  team: {
    name: 'Team',
    price: 299,
    seatCap: 15,
    priceId: 'price_1TUXB8E4f1D9W7YWhmNaJize',
    appleProductId: 'com.parallelstudios.realtorportal.teamplan.monthly',
    features: ['customBranding', 'teamOversight'] as PlanFeature[],
  },
  brokerage: {
    name: 'Brokerage',
    price: 799,
    seatCap: 50,
    priceId: 'price_1TUFlsE4f1D9W7YWXviZUzol',
    appleProductId: 'com.parallelstudios.realtorportal.brokerage.monthly',
    features: ['customBranding', 'teamOversight', 'analytics'] as PlanFeature[],
  },
  /**
   * Law-firm practices (firm_type='law_firm'). An attorney orchestrates deals
   * and invites realtors/buyers/sellers as participants — invited parties
   * never pay, same as the co-broker guest pass. Web (Stripe) billing only;
   * there is deliberately no Apple product, so the iOS paywall never offers
   * it and attorneys manage billing from the web dashboard.
   * Price id comes from env so it can go live without a deploy.
   */
  attorney: {
    name: 'Attorney',
    price: 49,
    seatCap: 3,
    priceId: process.env.STRIPE_PRICE_ATTORNEY ?? '',
    appleProductId: '',
    features: ['customBranding'] as PlanFeature[],
  },
} as const;

/** Trial gets the Solo feature set (so trials can evaluate the base product). */
export function tierHasFeature(
  tier: PlanTier | null | undefined,
  feature: PlanFeature
): boolean {
  const t = tier ?? 'solo';
  return (PLANS[t].features as readonly PlanFeature[]).includes(feature);
}

/** The lowest tier that includes a given feature (for upgrade prompts). */
export function minTierFor(feature: PlanFeature): PlanTier {
  if ((PLANS.solo.features as readonly PlanFeature[]).includes(feature)) return 'solo';
  if ((PLANS.team.features as readonly PlanFeature[]).includes(feature)) return 'team';
  return 'brokerage';
}

export function tierFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  for (const [tier, cfg] of Object.entries(PLANS)) {
    // Guard the empty-string priceId (attorney plan before its env var is
    // set) — otherwise a null-ish comparison could mis-map.
    if (cfg.priceId && cfg.priceId === priceId) return tier as PlanTier;
  }
  return null;
}

export function seatCapForTier(t: PlanTier | null | undefined): number {
  return t ? PLANS[t].seatCap : PLANS.solo.seatCap; // trial / unknown = Starter cap
}

/** Map an Apple auto-renewable product id back to the plan tier it grants. */
export function tierFromAppleProductId(
  productId: string | null | undefined
): PlanTier | null {
  if (!productId) return null;
  for (const [tier, cfg] of Object.entries(PLANS)) {
    if ((cfg as any).appleProductId && (cfg as any).appleProductId === productId)
      return tier as PlanTier;
  }
  return null;
}
