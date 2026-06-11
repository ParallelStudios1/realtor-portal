/**
 * Deal-kind helpers — mobile mirror of admin/lib/dealKind.ts.
 * Most realtors are LISTING agents, so a seller deal must read like a
 * listing, not a buyer search. Keep these tables in sync with the web app.
 */

export type DealKind = 'buyer' | 'seller' | 'both' | null | undefined;

/**
 * Canonical phase order — single source of truth for every stepper/picker.
 * Mirrors the Postgres `deal_phase` enum exactly (incl. counter_offer,
 * which several mobile steppers were missing).
 */
export const DEAL_PHASES = [
  'searching',
  'awaiting_offer',
  'offer_made',
  'counter_offer',
  'under_contract',
  'closing',
  'closed',
] as const;

const SELLER_PHASE_LABELS: Record<string, string> = {
  searching: 'Listing prep',
  awaiting_offer: 'Active · Listed',
  offer_made: 'Offer received',
  counter_offer: 'Negotiating',
  under_contract: 'Under contract',
  closing: 'Closing',
  closed: 'Sold',
};

const BUYER_PHASE_LABELS: Record<string, string> = {
  searching: 'Home search',
  awaiting_offer: 'Preparing offer',
  offer_made: 'Offer submitted',
  counter_offer: 'Negotiating',
  under_contract: 'Under contract',
  closing: 'Closing',
  closed: 'Closed',
};

/** Short labels for tight mobile steppers (7 across a phone screen). */
const SELLER_PHASE_LABELS_SHORT: Record<string, string> = {
  searching: 'Prep',
  awaiting_offer: 'Active',
  offer_made: 'Offer in',
  counter_offer: 'Negotiating',
  under_contract: 'Contract',
  closing: 'Closing',
  closed: 'Sold',
};

const BUYER_PHASE_LABELS_SHORT: Record<string, string> = {
  searching: 'Search',
  awaiting_offer: 'Offer prep',
  offer_made: 'Offer in',
  counter_offer: 'Negotiating',
  under_contract: 'Contract',
  closing: 'Closing',
  closed: 'Closed',
};

export function isSellerKind(kind: DealKind): boolean {
  return kind === 'seller';
}

/** Phase label that adapts to the deal kind. */
export function phaseLabelFor(
  phase: string | null | undefined,
  kind: DealKind
): string {
  const p = phase || 'searching';
  const table = isSellerKind(kind) ? SELLER_PHASE_LABELS : BUYER_PHASE_LABELS;
  return table[p] || p.replace(/_/g, ' ');
}

/** Compact label variant for steppers. */
export function phaseLabelShortFor(
  phase: string | null | undefined,
  kind: DealKind
): string {
  const p = phase || 'searching';
  const table = isSellerKind(kind)
    ? SELLER_PHASE_LABELS_SHORT
    : BUYER_PHASE_LABELS_SHORT;
  return table[p] || p.replace(/_/g, ' ');
}

/** One-line "what happens next" hint, shown under the current phase. */
const NEXT_STEP_HINTS: Record<string, { buyer: string; seller: string }> = {
  searching: {
    buyer: 'Next: pick the home you want to make an offer on.',
    seller: 'Next: finalize pricing and go live on the market.',
  },
  awaiting_offer: {
    buyer: 'Next: submit your offer to the seller.',
    seller: 'Next: review offers as they come in.',
  },
  offer_made: {
    buyer: 'Next: the seller accepts, counters, or declines.',
    seller: 'Next: accept, counter, or decline the offer.',
  },
  counter_offer: {
    buyer: 'Next: agree on final terms and go under contract.',
    seller: 'Next: agree on final terms and go under contract.',
  },
  under_contract: {
    buyer: 'Next: complete inspection, appraisal, and financing.',
    seller: 'Next: the buyer completes inspection and financing.',
  },
  closing: {
    buyer: 'Next: sign the closing documents and get your keys.',
    seller: 'Next: sign the closing documents and hand over the keys.',
  },
  closed: { buyer: '', seller: '' },
};

export function nextStepHintFor(
  phase: string | null | undefined,
  kind: DealKind
): string {
  const h = NEXT_STEP_HINTS[phase || 'searching'];
  if (!h) return '';
  return isSellerKind(kind) ? h.seller : h.buyer;
}

export const LISTING_STATUSES = [
  { id: 'coming_soon', label: 'Coming soon' },
  { id: 'active', label: 'Active' },
  { id: 'under_contract', label: 'Under contract' },
  { id: 'pending', label: 'Pending' },
  { id: 'sold', label: 'Sold' },
  { id: 'withdrawn', label: 'Withdrawn' },
] as const;

export function listingStatusLabel(s: string | null | undefined): string {
  return LISTING_STATUSES.find((x) => x.id === s)?.label || 'Active';
}
