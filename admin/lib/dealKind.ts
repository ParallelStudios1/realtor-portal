/**
 * Deal-kind helpers. Most realtors are LISTING agents (they represent the
 * seller), so a seller deal must read like a listing, not a buyer search.
 *
 * We reuse the shared `phase` enum (searching … closed) but relabel each phase
 * for the listing lifecycle when kind === 'seller'.
 */

export type DealKind = 'buyer' | 'seller' | 'both' | null | undefined;

/**
 * Canonical phase order - the single source of truth for every stepper and
 * picker. Mirrors the Postgres `deal_phase` enum exactly. Don't fork this
 * list locally: divergent copies are how /deal ended up missing
 * `counter_offer` while /client showed all seven.
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

/** Listing-lifecycle "what's happening now" copy for a buyer deal. */
const BUYER_PHASE_MESSAGES: Record<string, string> = {
  searching:
    'We are finding and touring homes that fit what you are looking for.',
  awaiting_offer:
    'You found a home you love. We are putting your offer together.',
  offer_made:
    'Your offer is in. We are waiting to hear back from the seller.',
  counter_offer:
    'We are negotiating the terms to get you the best deal.',
  under_contract:
    'Your offer was accepted! Inspection, appraisal, and financing happen during this stretch.',
  closing:
    'Almost home. We are finalizing the paperwork and scheduling your closing.',
  closed: 'It is official - congratulations on your new home!',
};

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

/** Listing-lifecycle "what's happening now" copy for a seller deal. */
const SELLER_PHASE_MESSAGES: Record<string, string> = {
  searching:
    'We are getting your home ready to list - pricing, photos, prep, and paperwork.',
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
  return BUYER_PHASE_MESSAGES[p] || '';
}

/** Short "what happens next" hint that adapts to the deal kind. */
export function nextStepHintFor(
  phase: string | null | undefined,
  kind: DealKind
): string {
  const p = phase || 'searching';
  const h = NEXT_STEP_HINTS[p];
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
