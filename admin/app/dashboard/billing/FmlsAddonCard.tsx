'use client';

import { useState } from 'react';

/**
 * The FMLS integration add-on card. Firm-level, no free trial, never
 * discounted — FMLS charges per subscriber from day one, so the price is the
 * price. One purchase covers the whole firm, solo agents included.
 */
export function FmlsAddonCard({
  active,
  available,
  priceLabel,
}: {
  active: boolean;
  /** False until STRIPE_PRICE_FMLS is configured — card renders as coming soon. */
  available: boolean;
  priceLabel: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/billing/fmls-checkout', { method: 'POST' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.url) {
        setError(json?.error || 'Could not start checkout.');
        return;
      }
      window.location.href = json.url;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-ink-900">
              FMLS Integration
            </h3>
            {active ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                Active
              </span>
            ) : (
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-600">
                Add-on
              </span>
            )}
          </div>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-600">
            Type an FMLS listing number and the property fills itself — address,
            price, beds and baths, square footage, listing agent, photo — on the
            deal, everywhere, with nothing to retype. Covers your whole firm.
          </p>
          <p className="mt-1.5 text-xs text-ink-500">
            {priceLabel ? `${priceLabel} · ` : ''}Billed monthly per firm. No
            free trial — MLS licensing starts the day you do.
          </p>
          {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
        </div>
        {!active &&
          (available ? (
            <button
              onClick={buy}
              disabled={busy}
              className="btn-primary shrink-0"
            >
              {busy ? 'Opening checkout…' : 'Add FMLS'}
            </button>
          ) : (
            <span className="shrink-0 rounded-lg border border-ink-200 px-3 py-2 text-xs font-semibold text-ink-500">
              Coming soon
            </span>
          ))}
      </div>
    </div>
  );
}
