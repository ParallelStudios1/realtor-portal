'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  LISTING_STATUSES,
  OFFER_STATUSES,
  listingStatusLabel,
  offerStatusLabel,
} from '@/lib/dealKind';
import {
  updateListingAction,
  addOfferAction,
  updateOfferStatusAction,
  deleteOfferAction,
} from './listingActions';

export type ListingHouse = {
  id: string;
  address: string | null;
  list_price: number | null;
  photo_url: string | null;
  listing_status: string | null;
  mls_number: string | null;
  listed_at: string | null;
  sold_price: number | null;
};

export type ListingOffer = {
  id: string;
  house_id: string | null;
  buyer_name: string | null;
  buyer_agent: string | null;
  amount: number | null;
  earnest_money: number | null;
  financing: string | null;
  status: string;
  offer_date: string | null;
  notes: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  coming_soon: 'bg-sky-100 text-sky-800',
  active: 'bg-emerald-100 text-emerald-800',
  under_contract: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
  sold: 'bg-ink-900 text-white',
  withdrawn: 'bg-ink-200 text-ink-600',
};

const OFFER_STYLE: Record<string, string> = {
  received: 'bg-sky-100 text-sky-800',
  countered: 'bg-amber-100 text-amber-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  withdrawn: 'bg-ink-200 text-ink-600',
};

function money(n: number | null | undefined) {
  return n == null ? '—' : '$' + Number(n).toLocaleString();
}

export function SellerListingPanel({
  searchId,
  houses,
  offers: initialOffers,
}: {
  searchId: string;
  houses: ListingHouse[];
  offers: ListingOffer[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [offers, setOffers] = useState<ListingOffer[]>(initialOffers);
  const [adding, setAdding] = useState(false);

  const setListingField = (
    houseId: string,
    patch: Parameters<typeof updateListingAction>[2]
  ) => {
    start(async () => {
      const r = await updateListingAction(searchId, houseId, patch);
      if (!r.ok) return toast.show(r.error || 'Failed', { variant: 'error' });
      router.refresh();
    });
  };

  const changeOfferStatus = (offerId: string, status: string) => {
    setOffers((o) => o.map((x) => (x.id === offerId ? { ...x, status } : x)));
    start(async () => {
      const r = await updateOfferStatusAction(searchId, offerId, status);
      if (!r.ok) {
        toast.show(r.error || 'Failed', { variant: 'error' });
        router.refresh();
      }
    });
  };

  const removeOffer = (offerId: string) => {
    setOffers((o) => o.filter((x) => x.id !== offerId));
    start(async () => {
      await deleteOfferAction(searchId, offerId);
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-ink-900 bg-white shadow-soft-md">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-900 px-5 py-2.5">
        <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M9 22V12h6v10" />
          </svg>
          Listings &amp; offers
        </h2>
      </div>

      <div className="space-y-4 p-5">
        {/* Listings */}
        {houses.length === 0 ? (
          <p className="text-sm text-ink-500">
            No listing added yet. Use “Add listing” above to add the property
            you&apos;re selling.
          </p>
        ) : (
          <ul className="space-y-3">
            {houses.map((h) => {
              const offersForHouse = offers.filter((o) => o.house_id === h.id);
              const status = h.listing_status || 'active';
              return (
                <li
                  key={h.id}
                  className="rounded-xl border border-ink-200 bg-ink-50/40 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-200">
                        {h.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={h.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink-900">
                          {h.address || 'Listing'}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-600">
                          List {money(h.list_price)}
                          {h.mls_number ? ` · MLS ${h.mls_number}` : ''}
                          {status === 'sold' && h.sold_price
                            ? ` · Sold ${money(h.sold_price)}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <span
                      className={
                        'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ' +
                        (STATUS_STYLE[status] || 'bg-ink-100 text-ink-700')
                      }
                    >
                      {listingStatusLabel(status)}
                    </span>
                  </div>

                  {/* Inline listing controls */}
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <label className="text-[11px] font-semibold text-ink-500">
                      Status
                      <select
                        className="input mt-1 py-1.5 text-sm"
                        value={status}
                        onChange={(e) =>
                          setListingField(h.id, { listing_status: e.target.value })
                        }
                      >
                        {LISTING_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-ink-500">
                      List price
                      <input
                        type="number"
                        defaultValue={h.list_price ?? ''}
                        onBlur={(e) =>
                          setListingField(h.id, {
                            list_price: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        className="input mt-1 py-1.5 text-sm"
                        placeholder="0"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-ink-500">
                      MLS #
                      <input
                        type="text"
                        defaultValue={h.mls_number ?? ''}
                        onBlur={(e) =>
                          setListingField(h.id, {
                            mls_number: e.target.value.trim() || null,
                          })
                        }
                        className="input mt-1 py-1.5 text-sm"
                        placeholder="e.g. 7412233"
                      />
                    </label>
                  </div>

                  {offersForHouse.length > 0 && (
                    <div className="mt-1 text-[11px] text-ink-500">
                      {offersForHouse.length} offer
                      {offersForHouse.length === 1 ? '' : 's'} on this listing
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Offers received */}
        <div className="border-t border-ink-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Offers received ({offers.length})
            </h3>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {adding ? 'Cancel' : '+ Log an offer'}
            </button>
          </div>

          {adding && (
            <AddOfferForm
              houses={houses}
              onSubmit={(payload) =>
                start(async () => {
                  const r = await addOfferAction(searchId, payload);
                  if (!r.ok)
                    return toast.show(r.error || 'Failed', { variant: 'error' });
                  setOffers((o) => [r.offer as ListingOffer, ...o]);
                  setAdding(false);
                  toast.show('Offer logged.', { variant: 'success' });
                })
              }
            />
          )}

          {offers.length === 0 ? (
            <p className="text-sm text-ink-500">
              No offers logged yet. When a buyer’s agent sends an offer, log it
              here to compare and respond.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {offers.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink-900">
                        {money(o.amount)}
                      </span>
                      <span
                        className={
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ' +
                          (OFFER_STYLE[o.status] || 'bg-ink-100 text-ink-700')
                        }
                      >
                        {offerStatusLabel(o.status)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-500">
                      {o.buyer_name || 'Buyer'}
                      {o.buyer_agent ? ` · agent ${o.buyer_agent}` : ''}
                      {o.financing ? ` · ${o.financing}` : ''}
                      {o.earnest_money != null
                        ? ` · EMD ${money(o.earnest_money)}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={o.status}
                      onChange={(e) => changeOfferStatus(o.id, e.target.value)}
                      className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs"
                    >
                      {OFFER_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeOffer(o.id)}
                      className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
                      aria-label="Delete offer"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function AddOfferForm({
  houses,
  onSubmit,
}: {
  houses: ListingHouse[];
  onSubmit: (payload: {
    house_id?: string | null;
    buyer_name?: string | null;
    buyer_agent?: string | null;
    amount?: number | null;
    earnest_money?: number | null;
    financing?: string | null;
    notes?: string | null;
  }) => void;
}) {
  const [houseId, setHouseId] = useState(houses[0]?.id || '');
  const [buyer, setBuyer] = useState('');
  const [agent, setAgent] = useState('');
  const [amount, setAmount] = useState('');
  const [emd, setEmd] = useState('');
  const [financing, setFinancing] = useState('conventional');

  return (
    <div className="mb-3 space-y-2 rounded-xl border border-ink-200 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {houses.length > 1 && (
          <label className="text-[11px] font-semibold text-ink-500 sm:col-span-2">
            Listing
            <select className="input mt-1 py-1.5 text-sm" value={houseId} onChange={(e) => setHouseId(e.target.value)}>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.address}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-[11px] font-semibold text-ink-500">
          Offer amount
          <input type="number" className="input mt-1 py-1.5 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </label>
        <label className="text-[11px] font-semibold text-ink-500">
          Earnest money
          <input type="number" className="input mt-1 py-1.5 text-sm" value={emd} onChange={(e) => setEmd(e.target.value)} placeholder="0" />
        </label>
        <label className="text-[11px] font-semibold text-ink-500">
          Buyer name
          <input className="input mt-1 py-1.5 text-sm" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
        </label>
        <label className="text-[11px] font-semibold text-ink-500">
          Buyer&apos;s agent
          <input className="input mt-1 py-1.5 text-sm" value={agent} onChange={(e) => setAgent(e.target.value)} />
        </label>
        <label className="text-[11px] font-semibold text-ink-500">
          Financing
          <select className="input mt-1 py-1.5 text-sm" value={financing} onChange={(e) => setFinancing(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="conventional">Conventional</option>
            <option value="fha">FHA</option>
            <option value="va">VA</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() =>
            onSubmit({
              house_id: houseId || null,
              buyer_name: buyer.trim() || null,
              buyer_agent: agent.trim() || null,
              amount: amount ? Number(amount) : null,
              earnest_money: emd ? Number(emd) : null,
              financing,
            })
          }
          disabled={!amount}
          className="btn-primary px-4 py-2 text-sm"
        >
          Log offer
        </button>
      </div>
    </div>
  );
}
