'use client';

import { useMemo, useState } from 'react';

export type Prefill = {
  searchId: string;
  dealName: string | null;
  salePrice: number | null;
  commissionPct: number | null;
};

/* ------------------------------------------------------------------ */
/* Formatting + parsing helpers                                        */
/* ------------------------------------------------------------------ */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  // Cents matter on a net sheet; show them whenever there's a fractional part.
  return Math.abs(n % 1) > 0.004 ? usdCents.format(n) : usd.format(n);
}

function signedMoney(n: number): string {
  if (n === 0) return money(0);
  return (n < 0 ? '-' : '') + money(Math.abs(n));
}

/** Parse a possibly-formatted numeric string into a finite number (or 0). */
function num(v: string): number {
  if (!v) return 0;
  const cleaned = v.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ */
/* Net-sheet math (pure)                                              */
/* ------------------------------------------------------------------ */

type NetSheetInputs = {
  salePrice: number;
  mortgagePayoff: number;
  listingCommissionPct: number;
  buyerAgentCommissionPct: number;
  closingCosts: number;
  concessions: number;
  taxProration: number;
  otherCosts: number;
};

type LineItem = { label: string; amount: number; note?: string };

type NetSheetResult = {
  grossPrice: number;
  listingCommission: number;
  buyerAgentCommission: number;
  totalCommission: number;
  deductions: LineItem[];
  totalDeductions: number;
  netProceeds: number;
};

function computeNetSheet(i: NetSheetInputs): NetSheetResult {
  const listingCommission = (i.salePrice * i.listingCommissionPct) / 100;
  const buyerAgentCommission = (i.salePrice * i.buyerAgentCommissionPct) / 100;
  const totalCommission = listingCommission + buyerAgentCommission;

  const deductions: LineItem[] = [
    {
      label: 'Mortgage payoff',
      amount: i.mortgagePayoff,
      note: 'Loan balance + payoff interest',
    },
    {
      label: 'Listing commission',
      amount: listingCommission,
      note: `${i.listingCommissionPct.toFixed(2)}% of sale price`,
    },
    {
      label: "Buyer's agent commission",
      amount: buyerAgentCommission,
      note: `${i.buyerAgentCommissionPct.toFixed(2)}% of sale price`,
    },
    {
      label: 'Seller-paid closing costs',
      amount: i.closingCosts,
      note: 'Title, escrow, transfer tax, attorney',
    },
    {
      label: 'Seller concessions',
      amount: i.concessions,
      note: 'Credits toward buyer costs',
    },
    {
      label: 'Property tax proration',
      amount: i.taxProration,
      note: "Seller's share through closing",
    },
    { label: 'Other costs', amount: i.otherCosts, note: 'HOA, repairs, warranty' },
  ];

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const netProceeds = i.salePrice - totalDeductions;

  return {
    grossPrice: i.salePrice,
    listingCommission,
    buyerAgentCommission,
    totalCommission,
    deductions,
    totalDeductions,
    netProceeds,
  };
}

/* ------------------------------------------------------------------ */
/* Reusable field components                                          */
/* ------------------------------------------------------------------ */

function CurrencyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-700">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-ink-300 bg-white shadow-soft-xs focus-within:border-ink-900 focus-within:ring-1 focus-within:ring-ink-900">
        <span className="pl-3 text-sm text-ink-400">$</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent px-2 py-2 text-right text-sm tabular-nums text-ink-900 outline-none placeholder:text-ink-300"
        />
      </div>
      {hint && <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

function PercentField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-700">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-ink-300 bg-white shadow-soft-xs focus-within:border-ink-900 focus-within:ring-1 focus-within:ring-ink-900">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent px-2 py-2 text-right text-sm tabular-nums text-ink-900 outline-none placeholder:text-ink-300"
        />
        <span className="pr-3 text-sm text-ink-400">%</span>
      </div>
      {hint && <span className="mt-1 block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-700">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 shadow-soft-xs outline-none placeholder:text-ink-300 focus:border-ink-900 focus:ring-1 focus:ring-ink-900"
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Offer comparison types + math                                      */
/* ------------------------------------------------------------------ */

const FINANCING = ['Conventional', 'FHA', 'VA', 'Cash', 'Other'] as const;
type Financing = (typeof FINANCING)[number];

type OfferInput = {
  id: string;
  label: string;
  offerPrice: string;
  financing: Financing;
  downPayment: string;
  earnest: string;
  contingencies: string;
  concessions: string;
};

function blankOffer(label: string): OfferInput {
  return {
    id: Math.random().toString(36).slice(2, 9),
    label,
    offerPrice: '',
    financing: 'Conventional',
    downPayment: '',
    earnest: '',
    contingencies: '',
    concessions: '',
  };
}

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */

export function NetSheetCalculator({ prefill }: { prefill: Prefill | null }) {
  // --- Net sheet inputs (strings so fields stay user-controlled) ---------
  const [salePrice, setSalePrice] = useState(
    prefill?.salePrice != null ? String(prefill.salePrice) : ''
  );
  const [mortgagePayoff, setMortgagePayoff] = useState('');
  const [listingPct, setListingPct] = useState(
    prefill?.commissionPct != null ? String(prefill.commissionPct) : '3'
  );
  const [buyerPct, setBuyerPct] = useState('3');
  const [closingCosts, setClosingCosts] = useState('');
  const [concessions, setConcessions] = useState('');
  const [taxProration, setTaxProration] = useState('');
  const [otherCosts, setOtherCosts] = useState('');

  const sheet = useMemo<NetSheetResult>(
    () =>
      computeNetSheet({
        salePrice: num(salePrice),
        mortgagePayoff: num(mortgagePayoff),
        listingCommissionPct: num(listingPct),
        buyerAgentCommissionPct: num(buyerPct),
        closingCosts: num(closingCosts),
        concessions: num(concessions),
        taxProration: num(taxProration),
        otherCosts: num(otherCosts),
      }),
    [
      salePrice,
      mortgagePayoff,
      listingPct,
      buyerPct,
      closingCosts,
      concessions,
      taxProration,
      otherCosts,
    ]
  );

  // --- Offer comparison --------------------------------------------------
  const [offers, setOffers] = useState<OfferInput[]>(() => {
    const first = blankOffer('Offer A');
    if (prefill?.salePrice != null) first.offerPrice = String(prefill.salePrice);
    return [first, blankOffer('Offer B')];
  });

  function updateOffer(id: string, patch: Partial<OfferInput>) {
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function addOffer() {
    setOffers((prev) =>
      prev.length >= 3
        ? prev
        : [...prev, blankOffer('Offer ' + String.fromCharCode(65 + prev.length))]
    );
  }
  function removeOffer(id: string) {
    setOffers((prev) => (prev.length <= 1 ? prev : prev.filter((o) => o.id !== id)));
  }

  // Each offer's estimated seller net reuses the SAME deduction structure as
  // the net sheet above - mortgage payoff, closing costs, tax proration, other
  // costs and both commission % carry over. Only the offer price and the
  // offer's own requested concessions vary. That keeps every offer on an
  // apples-to-apples basis against the seller's actual cost stack.
  const offerResults = useMemo(() => {
    return offers.map((o) => {
      const price = num(o.offerPrice);
      const result = computeNetSheet({
        salePrice: price,
        mortgagePayoff: num(mortgagePayoff),
        listingCommissionPct: num(listingPct),
        buyerAgentCommissionPct: num(buyerPct),
        closingCosts: num(closingCosts),
        concessions: num(o.concessions),
        taxProration: num(taxProration),
        otherCosts: num(otherCosts),
      });
      return { offer: o, net: result.netProceeds, price };
    });
  }, [
    offers,
    mortgagePayoff,
    listingPct,
    buyerPct,
    closingCosts,
    taxProration,
    otherCosts,
  ]);

  // Strongest = highest estimated net among offers that have a price entered.
  const bestNet = useMemo(() => {
    const withPrice = offerResults.filter((r) => r.price > 0);
    if (withPrice.length === 0) return null;
    return withPrice.reduce((best, r) => (r.net > best.net ? r : best)).offer.id;
  }, [offerResults]);

  return (
    <div className="space-y-8">
      {prefill?.dealName && (
        <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-2 text-xs text-ink-600">
          Prefilled from deal{' '}
          <span className="font-semibold text-ink-800">{prefill.dealName}</span>.
          Adjust any figure below - nothing is saved.
        </div>
      )}

      {/* ============ PART A: NET SHEET ============ */}
      <section className="grid gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Net sheet inputs
            </h2>
            <div className="mt-4 space-y-4">
              <CurrencyField
                label="Sale price"
                value={salePrice}
                onChange={setSalePrice}
              />
              <CurrencyField
                label="Mortgage payoff"
                value={mortgagePayoff}
                onChange={setMortgagePayoff}
                hint="Remaining loan balance to satisfy at closing"
              />
              <div className="grid grid-cols-2 gap-3">
                <PercentField
                  label="Listing commission"
                  value={listingPct}
                  onChange={setListingPct}
                />
                <PercentField
                  label="Buyer-agent commission"
                  value={buyerPct}
                  onChange={setBuyerPct}
                />
              </div>
              <CurrencyField
                label="Seller-paid closing costs"
                value={closingCosts}
                onChange={setClosingCosts}
                hint="Title, escrow, transfer tax, attorney fees"
              />
              <CurrencyField
                label="Seller concessions"
                value={concessions}
                onChange={setConcessions}
                hint="Credits to the buyer toward their costs"
              />
              <CurrencyField
                label="Property tax proration"
                value={taxProration}
                onChange={setTaxProration}
                hint="Seller's prorated share through closing date"
              />
              <CurrencyField
                label="Other costs"
                value={otherCosts}
                onChange={setOtherCosts}
                hint="HOA dues, repairs, home warranty, misc."
              />
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
            <div className="flex items-baseline justify-between border-b border-ink-100 px-5 py-3">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Estimated seller net sheet
              </h2>
              <span className="text-xs text-ink-400">Live estimate</span>
            </div>

            {/* Gross */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm font-semibold text-ink-900">Sale price</span>
              <span className="text-sm font-semibold tabular-nums text-ink-900">
                {money(sheet.grossPrice)}
              </span>
            </div>

            {/* Deductions */}
            <div className="border-t border-ink-100 bg-ink-50 px-5 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                Less - costs &amp; credits
              </span>
            </div>
            <div className="divide-y divide-ink-100">
              {sheet.deductions.map((d) => (
                <div
                  key={d.label}
                  className="flex items-start justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink-800">{d.label}</div>
                    {d.note && (
                      <div className="truncate text-[11px] text-ink-400">
                        {d.note}
                      </div>
                    )}
                  </div>
                  <span
                    className={
                      'shrink-0 text-sm tabular-nums ' +
                      (d.amount > 0 ? 'text-ink-700' : 'text-ink-300')
                    }
                  >
                    {d.amount > 0 ? '−' + money(d.amount) : money(0)}
                  </span>
                </div>
              ))}
            </div>

            {/* Total deductions */}
            <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3">
              <span className="text-sm font-medium text-ink-700">
                Total deductions
              </span>
              <span className="text-sm font-semibold tabular-nums text-ink-700">
                −{money(sheet.totalDeductions)}
              </span>
            </div>

            {/* Net */}
            <div
              className={
                'flex items-center justify-between px-5 py-4 ' +
                (sheet.netProceeds >= 0 ? 'bg-ink-900' : 'bg-rose-700')
              }
            >
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  Estimated net proceeds to seller
                </div>
                <div className="mt-0.5 text-[11px] text-white/50">
                  {sheet.grossPrice > 0
                    ? `${(
                        (sheet.netProceeds / sheet.grossPrice) *
                        100
                      ).toFixed(1)}% of sale price`
                    : 'Enter a sale price to begin'}
                </div>
              </div>
              <span className="text-2xl font-bold tabular-nums text-white">
                {signedMoney(sheet.netProceeds)}
              </span>
            </div>
          </div>

          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
            Estimate only. Actual proceeds depend on the final settlement
            statement, payoff figures as of the closing date, and any items not
            captured here. Not a substitute for a closing disclosure.
          </p>
        </div>
      </section>

      {/* ============ PART B: OFFER COMPARISON ============ */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink-900">
              Offer comparison
            </h2>
            <p className="text-xs text-ink-500">
              Each offer&apos;s net reuses the seller cost stack above - only the
              offer price and that offer&apos;s concessions differ.
            </p>
          </div>
          <button
            type="button"
            onClick={addOffer}
            disabled={offers.length >= 3}
            className="shrink-0 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-soft-xs transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add offer
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white shadow-soft">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-200">
                <th className="w-44 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  Field
                </th>
                {offers.map((o) => {
                  const isBest = bestNet === o.id;
                  return (
                    <th
                      key={o.id}
                      className={
                        'px-4 py-3 text-left align-bottom ' +
                        (isBest ? 'bg-ink-900' : '')
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          value={o.label}
                          onChange={(e) =>
                            updateOffer(o.id, { label: e.target.value })
                          }
                          className={
                            'w-full bg-transparent text-sm font-bold tracking-tight outline-none ' +
                            (isBest ? 'text-white' : 'text-ink-900')
                          }
                        />
                        {offers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOffer(o.id)}
                            aria-label={'Remove ' + o.label}
                            className={
                              'inline-flex shrink-0 items-center justify-center rounded px-1 transition ' +
                              (isBest
                                ? 'text-white/60 hover:text-white'
                                : 'text-ink-300 hover:text-ink-600')
                            }
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3" aria-hidden>
                              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {isBest && (
                        <span className="mt-1 inline-block rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          Strongest net
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {/* Offer price */}
              <OfferRow label="Offer price">
                {offers.map((o) => (
                  <OfferCell key={o.id} highlight={bestNet === o.id}>
                    <CellCurrency
                      value={o.offerPrice}
                      onChange={(v) => updateOffer(o.id, { offerPrice: v })}
                    />
                  </OfferCell>
                ))}
              </OfferRow>

              {/* Financing */}
              <OfferRow label="Financing type">
                {offers.map((o) => (
                  <OfferCell key={o.id} highlight={bestNet === o.id}>
                    <select
                      value={o.financing}
                      onChange={(e) =>
                        updateOffer(o.id, {
                          financing: e.target.value as Financing,
                        })
                      }
                      className="w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-ink-900"
                    >
                      {FINANCING.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </OfferCell>
                ))}
              </OfferRow>

              {/* Down payment */}
              <OfferRow label="Down payment">
                {offers.map((o) => {
                  const price = num(o.offerPrice);
                  const dp = num(o.downPayment);
                  const pct = price > 0 ? (dp / price) * 100 : 0;
                  return (
                    <OfferCell key={o.id} highlight={bestNet === o.id}>
                      <CellCurrency
                        value={o.downPayment}
                        onChange={(v) => updateOffer(o.id, { downPayment: v })}
                      />
                      {dp > 0 && price > 0 && (
                        <span className="mt-0.5 block text-right text-[10px] text-ink-400">
                          {pct.toFixed(0)}% down
                        </span>
                      )}
                    </OfferCell>
                  );
                })}
              </OfferRow>

              {/* Earnest money */}
              <OfferRow label="Earnest money">
                {offers.map((o) => (
                  <OfferCell key={o.id} highlight={bestNet === o.id}>
                    <CellCurrency
                      value={o.earnest}
                      onChange={(v) => updateOffer(o.id, { earnest: v })}
                    />
                  </OfferCell>
                ))}
              </OfferRow>

              {/* Contingencies */}
              <OfferRow label="Contingencies">
                {offers.map((o) => (
                  <OfferCell key={o.id} highlight={bestNet === o.id}>
                    <input
                      value={o.contingencies}
                      onChange={(e) =>
                        updateOffer(o.id, { contingencies: e.target.value })
                      }
                      placeholder="e.g. inspection, financing"
                      className="w-full rounded-md border border-ink-300 bg-white px-2 py-1.5 text-sm text-ink-900 outline-none placeholder:text-ink-300 focus:border-ink-900"
                    />
                  </OfferCell>
                ))}
              </OfferRow>

              {/* Requested concessions */}
              <OfferRow label="Requested concessions">
                {offers.map((o) => (
                  <OfferCell key={o.id} highlight={bestNet === o.id}>
                    <CellCurrency
                      value={o.concessions}
                      onChange={(v) => updateOffer(o.id, { concessions: v })}
                    />
                  </OfferCell>
                ))}
              </OfferRow>

              {/* Estimated seller net */}
              <tr className="border-t-2 border-ink-200">
                <td className="px-4 py-3 text-sm font-semibold text-ink-800">
                  Est. seller net
                </td>
                {offerResults.map((r) => {
                  const isBest = bestNet === r.offer.id;
                  const hasPrice = r.price > 0;
                  return (
                    <td
                      key={r.offer.id}
                      className={'px-4 py-3 ' + (isBest ? 'bg-ink-900' : '')}
                    >
                      <span
                        className={
                          'block text-right text-lg font-bold tabular-nums ' +
                          (isBest
                            ? 'text-white'
                            : hasPrice
                            ? 'text-ink-900'
                            : 'text-ink-300')
                        }
                      >
                        {hasPrice ? signedMoney(r.net) : '-'}
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* Delta vs strongest */}
              <tr>
                <td className="px-4 py-2 text-[11px] text-ink-400">
                  vs. strongest
                </td>
                {offerResults.map((r) => {
                  const best = offerResults.find((x) => x.offer.id === bestNet);
                  const delta = best ? r.net - best.net : 0;
                  const isBest = bestNet === r.offer.id;
                  return (
                    <td
                      key={r.offer.id}
                      className={'px-4 py-2 ' + (isBest ? 'bg-ink-900' : '')}
                    >
                      <span
                        className={
                          'block text-right text-xs tabular-nums ' +
                          (isBest
                            ? 'text-white/60'
                            : r.price > 0
                            ? 'text-rose-600'
                            : 'text-ink-300')
                        }
                      >
                        {isBest
                          ? '-'
                          : r.price > 0
                          ? signedMoney(delta)
                          : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
          Highest estimated net is highlighted. Net is the deciding signal, but
          weigh financing strength, contingency risk, and earnest money before
          advising the seller.
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Offer table sub-components                                         */
/* ------------------------------------------------------------------ */

function OfferRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr>
      <td className="px-4 py-2 text-xs font-medium text-ink-600">{label}</td>
      {children}
    </tr>
  );
}

function OfferCell({
  highlight,
  children,
}: {
  highlight: boolean;
  children: React.ReactNode;
}) {
  return (
    <td className={'px-4 py-2 align-top ' + (highlight ? 'bg-ink-900/[0.03]' : '')}>
      {children}
    </td>
  );
}

function CellCurrency({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-ink-300 bg-white focus-within:border-ink-900">
      <span className="pl-2 text-xs text-ink-400">$</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full bg-transparent px-2 py-1.5 text-right text-sm tabular-nums text-ink-900 outline-none placeholder:text-ink-300"
      />
    </div>
  );
}
