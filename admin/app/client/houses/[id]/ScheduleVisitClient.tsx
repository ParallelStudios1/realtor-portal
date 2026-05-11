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
        className="mt-4 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Schedule a visit →
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold">Schedule a visit</div>
      <label className="mt-3 block text-sm">
        <span className="block text-xs font-medium text-slate-600">
          When would you like to go? (any free text)
        </span>
        <input
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          placeholder="e.g. Sat afternoon, or Tue evening after 6pm"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="block text-xs font-medium text-slate-600">
          Anything to flag for your agent? (optional)
        </span>
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
                return toast.show(r.error, { variant: 'error' });
              toast.show('Tour requested — your agent will confirm.', {
                variant: 'success',
              });
              setOpen(false);
              setWhen('');
              setNotes('');
            })
          }
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Request tour'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
