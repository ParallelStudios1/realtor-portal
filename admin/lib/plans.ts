export type PlanTier = 'solo' | 'team' | 'brokerage';

export const PLANS = {
  solo:       { name: 'Solo',       price: 99,  seatCap: 1,  priceId: 'price_1TUXB4E4f1D9W7YWV6x21nCU' },
  team:       { name: 'Team',       price: 299, seatCap: 10, priceId: 'price_1TUXB8E4f1D9W7YWhmNaJize' },
  brokerage:  { name: 'Brokerage',  price: 799, seatCap: 50, priceId: 'price_1TUFlsE4f1D9W7YWXviZUzol' },
} as const;

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
