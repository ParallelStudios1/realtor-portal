'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { markAgreedHouseAction } from './tour-actions';

/**
 * CLIENT ↔ REALTOR HOUSE AGREEMENT - client control.
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
  state: 'agreedHere' | 'agreedElsewhere' | 'proposedHere' | 'none';
  agreedAddress?: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const accent = brandColor || '#0F172A';
  const [asking, setAsking] = useState(false);
  const [offer, setOffer] = useState('');

  if (state === 'proposedHere') {
    return (
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div>
          <div className="font-semibold text-amber-900">Sent to your agent</div>
          <p className="mt-0.5 text-xs text-amber-800">
            You picked this home - your agent will confirm it to make it official.
          </p>
        </div>
      </div>
    );
  }

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

  function pick(desiredOffer?: number | null) {
    start(async () => {
      const r = await markAgreedHouseAction(houseId, desiredOffer ?? null);
      if (!r.ok) {
        toast.show(r.error || 'Failed', { variant: 'error' });
        return;
      }
      setAsking(false);
      toast.show('Sent to your agent - they’ll confirm to make it official.', {
        variant: 'success',
      });
      router.refresh();
    });
  }

  // Offer-amount prompt shown after the buyer taps "This is the house I want".
  if (asking) {
    return (
      <div className="mt-5 rounded-xl border border-ink-200 bg-white px-4 py-4 text-sm shadow-soft-sm">
        <div className="font-semibold text-ink-900">
          How much would you like to offer?
        </div>
        <p className="mt-1 text-xs text-ink-600">
          Optional. This gives your agent a starting point - they’ll confirm the
          home and prepare the real offer with you.
        </p>
        <input
          inputMode="numeric"
          value={offer}
          onChange={(e) => setOffer(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="$ amount (optional)"
          className="input mt-3 w-full"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => pick(null)}
            className="btn-secondary"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const n = offer ? Number(offer) : null;
              pick(n && n > 0 ? n : null);
            }}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: accent }}
          >
            {pending ? 'Sending…' : 'Send to my agent'}
          </button>
        </div>
      </div>
    );
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
          onClick={() => setAsking(true)}
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
      onClick={() => setAsking(true)}
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
