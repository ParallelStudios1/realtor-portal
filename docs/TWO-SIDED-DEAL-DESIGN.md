# Two-Sided Deal Model — Design

## The problem
A real-estate transaction has two sides with **conflicting privacy needs**:
- The **buyer's** agent shows the buyer many candidate houses. The seller (and their
  agent) must **never** see the buyer's other houses, notes, or shortlist.
- The **seller's** agent has one listing and fields buyer interest.
Today a "deal" (`client_searches`) is one-sided and every party on it can see the whole
house list. That leaks the buyer's shopping list to the other side.

## The model

### Deal kind drives the workspace
`client_searches.kind ∈ (buyer | seller | both)`.
- **buyer deal** → houses are *private candidates*. The workspace leads with the
  candidate house list + per-house "other side" info. Seller-side parties are
  house-scoped (see below).
- **seller deal** → the *listing house* is created/championed up front; the workspace
  leads with the listing + buyer interest (showings, offers, the AVM lead funnel).

### Per-house "other side" (new `houses` columns — migration 0041)
A candidate house on a buyer deal can record who is on the selling side:
`seller_name, seller_email, seller_realtor_name, seller_realtor_email,
seller_realtor_firm`, plus `is_under_contract` (the chosen house).

### House-scoped visibility (new `deal_participants.house_id` — migration 0041)
A participant row may be **scoped to one house**. When `house_id` is set:
- That party (e.g. the seller's listing agent, the seller) sees **only that house**
  and the transaction around it — never the buyer's other candidate houses.
- Buyer-side parties have `house_id = NULL` → they see the whole deal.
Enforcement lives in the deal read paths (`/deal/[id]`, the cross-firm guest view):
if the caller's participant row is house-scoped, filter houses to that one `house_id`.

### Convergence flow (the moment the sides connect)
When a **buyer deal** goes under contract on a specific house
(`goUnderContractAction` / setting `offer_house_id`):
1. Mark that house `is_under_contract = true` and store it as `offer_house_id`.
2. Prompt the realtor: **"Who's selling this house?"** — capture seller + listing
   agent (name/email/firm) onto the house's seller_* columns. If the listing agent's
   email already belongs to a user in the system, **auto-link** them.
3. Add the listing agent (and optionally the seller) as `deal_participants` with
   `represents = 'seller'` and `house_id = <chosen house>` — so they join the deal
   **scoped to only that house**.
4. They get the branded `/invite/<token>` so they can collaborate on that one property
   without ever seeing the buyer's other candidates.

### Seller deal: listing + buyer interest
For a **seller deal**, a listing house is ensured at deal start (prompt if missing).
Buyer interest arrives via showings/offers and the public AVM funnel (`/value/[slug]`),
which already captures seller leads — the inverse (buyer leads on a listing) is the
"search for buyers" surface to grow next.

## Build phases
- **Phase 1 (foundation, this pass):** migration 0041; the under-contract
  "who's selling this house?" capture that links/creates the house-scoped seller party;
  house-scoped visibility enforcement on the deal read paths; buyer-vs-seller workspace
  differentiation (listing-first for sellers, candidate-list for buyers; per-house
  seller info on buyer deals).
- **Phase 2 (next):** seller-deal "buyer interest" inbox (offers + buyer leads);
  two-way cross-firm linking when both sides run the same address in-app; mobile parity.
