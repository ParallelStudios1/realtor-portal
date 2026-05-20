'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/Toast';
import { createNewDealAction } from './actions';

/**
 * The two header actions for a client profile: "+ New deal" (opens a quick
 * modal that asks buyer vs seller + an optional name) and a "Quick message"
 * shortcut. Both fire server actions and refresh the profile so the new
 * row shows up in the deals list immediately.
 */
export function ClientProfileActions({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'buyer' | 'seller'>('buyer');
  const [name, setName] = useState('');
  const [pending, start] = useTransition();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-primary text-xs"
        >
          + New deal
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white shadow-soft-xl animate-slide-up sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
              <h3 className="text-base font-bold tracking-tight">
                Start a new deal with {clientName}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="-mr-1.5 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-sm">
                <span className="label">Deal type</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(['buyer', 'seller'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={
                        'rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ' +
                        (kind === k
                          ? 'border-ink-900 bg-ink-900 text-white'
                          : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50')
                      }
                    >
                      {k === 'buyer' ? '🔍 Buyer search' : '🏠 Listing'}
                    </button>
                  ))}
                </div>
              </label>
              <label className="block text-sm">
                <span className="label">
                  Deal name (optional)
                </span>
                <input
                  type="text"
                  className="input mt-1.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    kind === 'seller'
                      ? '"123 Main St listing"'
                      : '"Westside buyer search"'
                  }
                />
                <p className="mt-1 text-[11px] text-ink-500">
                  Helps you tell deals apart when a client has multiple.
                </p>
              </label>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await createNewDealAction(clientId, {
                      kind,
                      name: name.trim() || undefined,
                    });
                    if (!r.ok) {
                      toast.show(r.error || 'Failed', { variant: 'error' });
                      return;
                    }
                    toast.show('Deal started.', { variant: 'success' });
                    if ((r as any).dealId) {
                      router.push('/dashboard/deals/' + (r as any).dealId);
                    } else {
                      router.refresh();
                      setOpen(false);
                    }
                  })
                }
                className="btn-primary w-full"
              >
                {pending ? 'Starting…' : 'Start deal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
