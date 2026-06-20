export type PlanTier = 'solo' | 'team' | 'brokerage';

/**
 * Real, enforceable feature flags per tier. These gate actual pages/actions
 * (not just marketing copy), so a higher tier unlocks capabilities a lower
 * tier genuinely cannot use:
 *   - teamOversight  → /dashboard/oversight (firm-wide deadline oversight)
 *   - analytics      → /dashboard/analytics (firm-wide performance analytics)
 *   - customBranding → firm logo/colors/tagline on the portal + mobile app
 */
export type PlanFeature = 'customBranding' | 'teamOversight' | 'analytics';

export const PLANS = {
  solo: {
    name: 'Solo',
    price: 99,
    seatCap: 1,
    priceId: 'price_1TUXB4E4f1D9W7YWV6x21nCU',
    features: ['customBranding'] as PlanFeature[],
  },
  team: {
    name: 'Team',
    price: 299,
    seatCap: 10,
    priceId: 'price_1TUXB8E4f1D9W7YWhmNaJize',
    features: ['customBranding', 'teamOversight'] as PlanFeature[],
  },
  brokerage: {
    name: 'Brokerage',
    price: 799,
    seatCap: 50,
    priceId: 'price_1TUFlsE4f1D9W7YWXviZUzol',
    features: ['customBranding', 'teamOversight', 'analytics'] as PlanFeature[],
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
    if (cfg.priceId === priceId) return tier as PlanTier;
  }
  return null;
}

export function seatCapForTier(t: PlanTier | null | undefined): number {
  return t ? PLANS[t].seatCap : 1; // trial / unknown = solo cap
}
