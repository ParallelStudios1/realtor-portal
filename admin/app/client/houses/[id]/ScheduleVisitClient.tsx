'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/Toast';
import { requestTourAction } from './tour-actions';

export function ScheduleVisitClient({
  houseId,
  pendingTour,
}: {
  houseId: string;
  pendingTour: { id: string; preferred_when: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();
  const toast = useToast();

  if (pendingTour) {
    return (
      <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span className="font-semibold">Tour request pending.</span>{' '}
        Your agent will confirm or suggest a different time.
        {pendingTour.preferred_when && (
          <span className="block text-xs text-amber-800">
            You asked for: {pendingTour.preferred_when}
          </span>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-primary mt-5 px-4 py-2.5"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        Schedule a visit
      </button>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-ink-200 bg-ink-50 p-4">
      <div className="text-sm font-semibold">Schedule a visit</div>
      <label className="mt-3 block text-sm">
        <span className="block text-xs font-medium text-ink-600">
          When would you like to go?
        </span>
        <input
          type="datetime-local"
          className="input mt-1.5"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="block text-xs font-medium text-ink-600">
          Anything to flag for your agent? (optional)
        </span>
        <textarea
          rows={2}
          className="input mt-1.5"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Specific rooms to check, questions, etc."
        />
      </label>
      <div className="mt-4 flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await requestTourAction(houseId, {
                preferred_when: when.trim() || undefined,
                notes: notes.trim() || undefined,
              });
              if (!r.ok)
                return toast.show(r.error || 'Failed', { variant: 'error' });
              toast.show('Tour requested — your agent will confirm.', {
                variant: 'success',
              });
              setOpen(false);
              setWhen('');
              setNotes('');
            })
          }
          className="btn-primary"
        >
          {pending ? 'Sending…' : 'Request tour'}
        </button>
        <button onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
