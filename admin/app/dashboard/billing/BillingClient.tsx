'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { humanError, humanErrorFromResponse } from '@/lib/humanError';

type Plan = {
  id: string;
  name: string;
  price: string;
  sub: string;
  who: string;
  features: string[];
  popular?: boolean;
};

export function BillingClient({
  plans,
  currentStatus,
  billingSource,
  currentTier,
}: {
  plans: Plan[];
  currentStatus: string | null;
  /** 'apple' when the firm subscribed on iOS, 'stripe' for web checkout. */
  billingSource?: string | null;
  /** The tier the firm is actually on, so we can mark it and disable re-buying. */
  currentTier?: string | null;
}) {
  // An Apple-billed firm must manage its plan on the device — Apple owns that
  // subscription. Offering Stripe checkout here would double-bill them.
  const appleManaged = currentStatus === 'active' && billingSource === 'apple';
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function startCheckout(planId: string) {
    setPendingPlan(planId);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      // Read body as text first so we can show a useful message even if the
      // server returned an empty body or HTML error page.
      const raw = await res.text();
      let json: any = null;
      if (raw) {
        try {
          json = JSON.parse(raw);
        } catch {
          json = null;
        }
      }
      if (!res.ok || !json?.url) {
        throw new Error(humanErrorFromResponse(res, raw));
      }
      window.location.href = json.url;
    } catch (err: any) {
      const msg = humanError(err);
      setError(msg);
      toast.show(msg, { variant: 'error' });
      setPendingPlan(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {appleManaged && (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <strong className="block text-blue-900">
            Your plan is billed through Apple.
          </strong>
          Everything you paid for works here on the web too. To switch plans or
          cancel, open Realtor Portal on your iPhone and go to Settings →
          Change or cancel plan. Buying here would charge you a second time.
        </div>
      )}
      <div className="mt-8 grid items-start gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const pending = pendingPlan === p.id;
          const isCurrent = currentStatus === 'active' && currentTier === p.id;
          const disabled = pending || appleManaged || isCurrent;
          return (
            <div
              key={p.id}
              className={
                'relative rounded-2xl border bg-white p-6 transition ' +
                (p.popular
                  ? 'border-ink-900 shadow-soft-lg ring-1 ring-ink-900 md:-translate-y-1'
                  : 'border-ink-200 shadow-soft-sm hover:border-ink-300 hover:shadow-soft-md')
              }
            >
              {isCurrent ? (
                <div className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-soft-sm">
                  Your plan
                </div>
              ) : (
                p.popular && (
                  <div className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-ink-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-soft-sm">
                    Most popular
                  </div>
                )
              )}
              <h3 className="text-sm font-bold uppercase tracking-wide text-ink-700">
                {p.name}
              </h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-ink-900">
                  {p.price}
                </span>
                <span className="text-sm text-ink-500">{p.sub}</span>
              </div>
              <p className="mt-1 text-xs text-ink-500">{p.who}</p>
              <ul className="mt-5 space-y-2.5 border-t border-ink-100 pt-5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-ink-700">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden>
                      <path d="M4 10.5l3.5 3.5L16 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={disabled}
                onClick={() => startCheckout(p.id)}
                data-loading={pending ? 'true' : undefined}
                className={
                  'mt-6 block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none ' +
                  (isCurrent
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                    : p.popular
                      ? 'bg-ink-900 text-white shadow-soft-sm hover:bg-ink-700'
                      : 'border border-ink-300 bg-white text-ink-800 hover:bg-ink-50')
                }
              >
                {pending
                  ? 'Redirecting…'
                  : isCurrent
                    ? 'Current plan'
                    : appleManaged
                      ? 'Managed on iPhone'
                      : currentStatus === 'active'
                        ? 'Switch plan'
                        : 'Subscribe'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
