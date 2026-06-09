/**
 * Deal-kind helpers. Most realtors are LISTING agents (they represent the
 * seller), so a seller deal must read like a listing, not a buyer search.
 *
 * We reuse the shared `phase` enum (searching … closed) but relabel each phase
 * for the listing lifecycle when kind === 'seller'.
 */

export type DealKind = 'buyer' | 'seller' | 'both' | null | undefined;

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
  searching: 'Searching',
  awaiting_offer: 'Awaiting offer',
  offer_made: 'Offer made',
  counter_offer: 'Counter offer',
  under_contract: 'Under contract',
  closing: 'Closing',
  closed: 'Closed',
};

/** Listing-lifecycle "what's happening now" copy for a seller deal. */
const SELLER_PHASE_MESSAGES: Record<string, string> = {
  searching:
    'We are getting your home ready to list — pricing, photos, prep, and paperwork.',
  awaiting_offer:
    'Your home is active on the market. We are coordinating showings and watching for offers.',
  offer_made:
    'An offer has come in. We are reviewing the terms together and deciding how to respond.',
  counter_offer:
    'We are negotiating the terms of an offer to get you the best result.',
  under_contract:
    'You are under contract. Inspection, appraisal, and the buyer’s financing happen during this stretch.',
  closing:
    'You are almost there. We are finalizing documents and coordinating the closing.',
  closed: 'Sold and closed. Congratulations on the sale!',
};

export function isSellerKind(kind: DealKind): boolean {
  return kind === 'seller';
}

/** Phase label that adapts to the deal kind. */
export function phaseLabelFor(
  phase: string | null | undefined,
  kind: DealKind,
  overrides?: Record<string, string> | null
): string {
  const p = phase || 'searching';
  if (overrides && overrides[p]) return overrides[p];
  const table = isSellerKind(kind) ? SELLER_PHASE_LABELS : BUYER_PHASE_LABELS;
  return table[p] || p.replace(/_/g, ' ');
}

/** Per-phase "what's happening" message that adapts to the deal kind. */
export function phaseMessageFor(
  phase: string | null | undefined,
  kind: DealKind,
  overrides?: Record<string, string> | null
): string {
  const p = phase || 'searching';
  if (overrides && overrides[p]) return overrides[p];
  if (isSellerKind(kind)) return SELLER_PHASE_MESSAGES[p] || '';
  return '';
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

export const OFFER_STATUSES = [
  { id: 'received', label: 'Received' },
  { id: 'countered', label: 'Countered' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' },
] as const;

export function offerStatusLabel(s: string | null | undefined): string {
  return OFFER_STATUSES.find((x) => x.id === s)?.label || 'Received';
}
