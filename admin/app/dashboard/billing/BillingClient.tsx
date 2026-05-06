'use client';

import { useState } from 'react';

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
}: {
  plans: Plan[];
  currentStatus: string | null;
}) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(planId: string) {
    setPendingPlan(planId);
    setError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error || 'Could not start checkout.');
      }
      window.location.href = json.url;
    } catch (err: any) {
      setError(err.message);
      setPendingPlan(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const pending = pendingPlan === p.id;
          return (
            <div
              key={p.id}
              className={
                'rounded-xl border bg-white p-6 ' +
                (p.popular
                  ? 'border-blue-500 shadow-lg ring-2 ring-blue-500'
                  : 'border-slate-200')
              }
            >
              {p.popular && (
                <div className="mb-2 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </div>
              )}
              <h3 className="font-semibold">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{p.price}</span>
                <span className="text-sm text-slate-500">{p.sub}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.who}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={pending}
                onClick={() => startCheckout(p.id)}
                className={
                  'mt-6 block w-full rounded-md px-4 py-2 text-center text-sm font-semibold disabled:opacity-50 ' +
                  (p.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-900 text-white hover:bg-slate-700')
                }
              >
                {pending
                  ? 'Redirecting…'
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
