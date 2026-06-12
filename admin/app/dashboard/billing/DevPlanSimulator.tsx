'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { simulatePlanAction } from './actions';
import type { PlanTier } from '@/lib/plans';

/**
 * DEV-ONLY panel (rendered server-side only for turnerlogan@parallelstudios.co)
 * to flip the firm between simulated plan tiers without paying Stripe.
 */
export function DevPlanSimulator({
  currentTier,
  simulated,
}: {
  currentTier: PlanTier | null;
  simulated: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(tier: PlanTier | 'reset') {
    setError(null);
    start(async () => {
      const r = await simulatePlanAction(tier);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const tiers: PlanTier[] = ['solo', 'team', 'brokerage'];

  return (
    <div className="mt-8 rounded-2xl border border-dashed border-ink-400 bg-ink-50 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-600">
          Plan simulator · only you can see this
        </div>
        {simulated && (
          <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Simulated
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-600">
        Flips this firm between tiers without charging Stripe, so seat caps and
        plan gates can be tested. Refuses to touch a real subscription.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tiers.map((t) => (
          <button
            key={t}
            type="button"
            disabled={pending || (simulated && currentTier === t)}
            onClick={() => run(t)}
            className={
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ' +
              (simulated && currentTier === t
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400')
            }
          >
            {simulated && currentTier === t ? 'Active: ' : 'Simulate '}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => run('reset')}
          className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-50"
        >
          Reset to trial
        </button>
        {pending && <span className="text-xs text-ink-500">Applying…</span>}
      </div>
      {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
