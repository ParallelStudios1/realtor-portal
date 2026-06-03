'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { markAgreedHouseAction } from './tour-actions';

/**
 * CLIENT ↔ REALTOR HOUSE AGREEMENT — client control.
 *
 * Renders one of three states on a house detail page:
 *   - `agreedHere`  → this house is already the agreed home (banner, no button)
 *   - `agreedElsewhere` → a different house is agreed; this one offers to switch
 *   - default       → no house agreed yet; offer "This is the house I want"
 *
 * The action is principal-client-guarded server-side.
 */
export function AgreedHouseClient({
  houseId,
  brandColor,
  state,
  agreedAddress,
}: {
  houseId: string;
  brandColor: string | null;
  state: 'agreedHere' | 'agreedElsewhere' | 'none';
  agreedAddress?: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const accent = brandColor || '#0F172A';

  if (state === 'agreedHere') {
    return (
      <div
        className="mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
        style={{ borderColor: accent, backgroundColor: accent + '10' }}
      >
        <span
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: accent }}
          aria-hidden
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <div className="font-semibold text-ink-900">This is the home you want</div>
          <p className="mt-0.5 text-xs text-ink-600">
            You and your agent are working toward this property.
          </p>
        </div>
      </div>
    );
  }

  function pick() {
    start(async () => {
      const r = await markAgreedHouseAction(houseId);
      if (!r.ok) {
        toast.show(r.error || 'Failed', { variant: 'error' });
        return;
      }
      toast.show('Your agent has been notified — this is your home.', {
        variant: 'success',
      });
      router.refresh();
    });
  }

  if (state === 'agreedElsewhere') {
    return (
      <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm">
        <p className="text-ink-700">
          You currently want{' '}
          <span className="font-semibold text-ink-900">
            {agreedAddress || 'another home'}
          </span>
          .
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={pick}
          className="btn-secondary mt-3"
        >
          {pending ? 'Updating…' : 'Make this my home instead'}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={pick}
      className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-soft-sm transition active:scale-[0.98] disabled:opacity-60"
      style={{ backgroundColor: accent }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {pending ? 'Sending…' : 'This is the house I want'}
    </button>
  );
}
