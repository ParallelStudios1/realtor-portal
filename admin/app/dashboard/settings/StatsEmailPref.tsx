'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/Toast';
import { saveStatsCadenceAction } from './actions';

const OPTIONS: { v: string; t: string; d: string }[] = [
  { v: 'monthly', t: 'Every month', d: 'A recap on the 1st, covering the month before' },
  { v: 'annual', t: 'Every year', d: 'A recap on Jan 1, covering the year before' },
  { v: 'off', t: 'Off', d: 'No recap emails' },
];

/**
 * Realtor preference for the "congrats, here's what you closed" recap email.
 * Persists immediately on change via saveStatsCadenceAction.
 */
export function StatsEmailPref({ initial }: { initial: string }) {
  const [cadence, setCadence] = useState(initial || 'monthly');
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function choose(v: string) {
    const prev = cadence;
    setCadence(v);
    startTransition(async () => {
      const r = await saveStatsCadenceAction(v);
      if ((r as any)?.error) {
        setCadence(prev);
        toast.show((r as any).error, { variant: 'error' });
      } else {
        toast.show('Saved.', { variant: 'success' });
      }
    });
  }

  return (
    <div className="grid gap-2">
      {OPTIONS.map((o) => (
        <label
          key={o.v}
          className={
            'flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition ' +
            (cadence === o.v ? 'border-ink-900 bg-ink-50' : 'border-ink-200 hover:border-ink-300')
          }
        >
          <input
            type="radio"
            name="stats-cadence"
            className="mt-0.5"
            checked={cadence === o.v}
            disabled={pending}
            onChange={() => choose(o.v)}
          />
          <span>
            <span className="block font-semibold text-ink-900">{o.t}</span>
            <span className="block text-xs text-ink-500">{o.d}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
