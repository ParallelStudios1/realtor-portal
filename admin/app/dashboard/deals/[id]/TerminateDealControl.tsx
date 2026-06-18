'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { terminateDealAction } from './dealLifecycleActions';

const REASONS = [
  { id: 'inspection', label: 'Inspection failed' },
  { id: 'financing', label: 'Financing fell through' },
  { id: 'appraisal', label: 'Appraisal came in low' },
  { id: 'title', label: 'Title issue' },
  { id: 'buyer_withdrew', label: 'Buyer withdrew' },
  { id: 'seller_withdrew', label: 'Seller withdrew' },
  { id: 'mutual', label: 'Mutual agreement' },
  { id: 'other', label: 'Other' },
];

/**
 * "Deal fell through" control. Reverts the deal (and any linked counterpart)
 * back to pre-contract state instead of forcing the realtor to build a whole
 * new deal — the listing goes back on the market, the buyer goes back to
 * searching, and everyone keeps their houses, documents, and parties.
 */
export function TerminateDealControl({
  searchId,
  kind,
}: {
  searchId: string;
  kind: 'buyer' | 'seller' | 'both' | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('inspection');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const isSeller = kind === 'seller';

  const submit = () => {
    const fd = new FormData();
    fd.set('search_id', searchId);
    fd.set('reason', reason);
    start(async () => {
      try {
        const r = await terminateDealAction(fd);
        if (!r || !r.ok) {
          toast.show((r && (r as any).error) || 'Could not terminate.', {
            variant: 'error',
          });
          return;
        }
        toast.show(
          isSeller
            ? 'Deal terminated — your listing is back on the market.'
            : 'Deal terminated — back to searching.',
          { variant: 'success' }
        );
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        toast.show(e?.message || 'Could not terminate the deal.', {
          variant: 'error',
        });
      }
    });
  };

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-700">
            If the deal falls through
          </div>
          <p className="mt-1 text-sm text-rose-900/80">
            Reverts this deal to before it went under contract —{' '}
            {isSeller
              ? 'your listing goes back on the market'
              : 'back to searching'}
            . Everyone keeps their houses, documents, and parties. No need to
            start a new deal.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          >
            Deal fell through
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-rose-200 bg-white px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-600">
              What happened?
            </span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-ink-900 focus:outline-none"
            >
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? 'Reverting…' : 'Terminate & revert deal'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
