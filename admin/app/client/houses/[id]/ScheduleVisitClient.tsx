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
      <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
        className="mt-4 rounded-md bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-700"
      >
        Schedule a visit →
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-4">
      <div className="text-sm font-semibold">Schedule a visit</div>
      <label className="mt-3 block text-sm">
        <span className="block text-xs font-medium text-ink-600">
          When would you like to go?
        </span>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
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
          className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Specific rooms to check, questions, etc."
        />
      </label>
      <div className="mt-3 flex gap-2">
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
          className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Request tour'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md border border-ink-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
