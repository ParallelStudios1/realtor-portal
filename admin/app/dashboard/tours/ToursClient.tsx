'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export type Tour = {
  id: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled';
  preferred_when: string | null;
  notes: string | null;
  created_at: string;
  handled_at: string | null;
  house_id: string | null;
  house_address: string | null;
  house_photo_url: string | null;
  house_list_price: number | null;
  client_id: string | null;
  client_name: string;
  client_email: string | null;
  search_id: string | null;
  search_name: string | null;
};

export function ToursClient({
  firmId,
  pending,
  recent,
}: {
  firmId: string;
  pending: Tour[];
  recent: Tour[];
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(tour: Tour, status: 'confirmed' | 'declined') {
    if (busy) return;
    setBusy(tour.id);
    setError(null);

    // Update the tour_request row. RLS on the table requires
    // current_role()='realtor' AND firm match — both are true here.
    const { error: updErr } = await supabase
      .from('tour_requests')
      .update({
        status,
        handled_at: new Date().toISOString(),
      })
      .eq('id', tour.id);

    if (updErr) {
      setError(updErr.message);
      setBusy(null);
      return;
    }

    if (status === 'confirmed' && tour.search_id) {
      // Best-effort date parse from the freeform preferred_when.
      const tryDate = tour.preferred_when ? new Date(tour.preferred_when) : null;
      const dateStr =
        tryDate && !isNaN(tryDate.getTime())
          ? tryDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

      const label = tour.house_address
        ? `Tour: ${tour.house_address}`
        : 'Tour confirmed';

      const { error: dateErr } = await supabase.from('important_dates').insert({
        firm_id: firmId,
        search_id: tour.search_id,
        label,
        date: dateStr,
        notes: tour.preferred_when || tour.notes || null,
      });
      if (dateErr) {
        // Don't roll back the status update — surface the warning but the
        // realtor still got the tour out of the pending queue.
        console.warn('[tours] could not write important_dates', dateErr.message);
      }

      // Fire-and-forget push to the client.
      fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId: tour.search_id,
          kind: 'tour',
          title: 'Tour confirmed',
          body: tour.house_address
            ? `Your tour of ${tour.house_address} is on the calendar.`
            : 'Your realtor confirmed your tour.',
        }),
      }).catch(() => {});
    }

    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
            Nothing waiting on you. Nice.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((t) => (
              <article
                key={t.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-900">
                      {t.house_address || 'House'}
                    </h3>
                    {t.house_list_price ? (
                      <span className="text-xs text-slate-500">
                        ${Number(t.house_list_price).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {t.client_name}
                    {t.preferred_when ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {t.preferred_when}
                      </span>
                    ) : null}
                  </div>
                  {t.notes ? (
                    <p className="mt-2 text-sm italic text-slate-500">
                      "{t.notes}"
                    </p>
                  ) : null}
                  <div className="mt-1 text-xs text-slate-400">
                    Requested {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2 sm:ml-4">
                  <button
                    onClick={() => act(t, 'declined')}
                    disabled={busy === t.id}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => act(t, 'confirmed')}
                    disabled={busy === t.id}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {busy === t.id ? 'Saving…' : 'Confirm'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">House</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {t.house_address || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{t.client_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {t.preferred_when || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(t.handled_at || t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TODO(v1.1): Email + ICS attachment for confirmed tours via Resend.
          Push + in-app `important_dates` row covers v1. */}
    </div>
  );
}

function StatusPill({ status }: { status: Tour['status'] }) {
  const styles: Record<Tour['status'], string> = {
    pending: 'bg-amber-50 text-amber-800',
    confirmed: 'bg-emerald-50 text-emerald-800',
    declined: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-slate-100 text-slate-500 line-through',
  };
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        styles[status]
      }
    >
      {status}
    </span>
  );
}
