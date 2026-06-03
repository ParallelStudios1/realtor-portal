'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

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

// Parse a stored preferred_when into the value a <input type="datetime-local">
// expects ("YYYY-MM-DDTHH:mm") WITHOUT going through a Date (which would shift
// the day by the timezone offset). Falls back to 9am for date-only strings.
function toLocalInput(s: string | null): string {
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T09:00`;
  return '';
}

// Human-friendly label for a stored preferred_when, timezone-stable (reads the
// literal Y/M/D + H:m, never constructs a tz-shifting Date).
function prettyWhen(s: string | null): string {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return s;
  const [, y, mo, d, hh, mm] = m;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const base = `${months[Number(mo) - 1]} ${Number(d)}, ${y}`;
  if (hh == null) return base;
  let h = Number(hh);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${base} at ${h}:${mm} ${ap}`;
}

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
  // Per-tour editable date/time so the realtor can reschedule before confirming.
  const [whenEdits, setWhenEdits] = useState<Record<string, string>>({});
  const toast = useToast();

  const whenFor = (t: Tour) => whenEdits[t.id] ?? toLocalInput(t.preferred_when);

  async function act(tour: Tour, status: 'confirmed' | 'declined') {
    if (busy) return;
    setBusy(tour.id);
    setError(null);

    // The realtor may have changed the time in the input. Use that as the
    // agreed time; persist it back so the client sees the confirmed slot.
    const chosen = status === 'confirmed' ? whenFor(tour).trim() : '';

    const update: Record<string, any> = {
      status,
      handled_at: new Date().toISOString(),
    };
    if (status === 'confirmed' && chosen) update.preferred_when = chosen;

    const { error: updErr } = await supabase
      .from('tour_requests')
      .update(update)
      .eq('id', tour.id);

    if (updErr) {
      const msg = humanError(updErr);
      setError(msg);
      toast.show(msg, { variant: 'error' });
      setBusy(null);
      return;
    }

    if (status === 'confirmed' && tour.search_id) {
      // TIMEZONE-SAFE: read the literal date + time straight from the
      // datetime-local string. Do NOT round-trip through Date()/toISOString()
      // — that converts local -> UTC and rolls evening times to the next day.
      const src = chosen || tour.preferred_when || '';
      const m = src.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
      const dateStr = m ? m[1] : new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
      const timeStr = m && m[2] ? m[2] : null;

      const label = tour.house_address
        ? `Tour: ${tour.house_address}`
        : 'Tour confirmed';

      const { error: dateErr } = await supabase.from('important_dates').insert({
        firm_id: firmId,
        search_id: tour.search_id,
        label,
        date: dateStr,
        event_time: timeStr,
        notes: tour.notes || null,
      });
      if (dateErr) {
        console.warn('[tours] could not write important_dates', dateErr.message);
      }

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

      fetch('/api/notifications/send-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'tour_confirmed',
          searchId: tour.search_id,
          tourRequestId: tour.id,
        }),
      }).catch(() => {});
    }

    if (status === 'declined' && tour.search_id) {
      fetch('/api/notifications/send-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'tour_declined',
          searchId: tour.search_id,
          tourRequestId: tour.id,
        }),
      }).catch(() => {});
    }

    setBusy(null);
    toast.show(status === 'confirmed' ? 'Tour confirmed.' : 'Tour declined.', {
      variant: 'success',
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="surface px-5 py-6 text-sm text-ink-500">
            Nothing waiting on you.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((t) => (
              <article
                key={t.id}
                className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="truncate text-base font-semibold text-ink-900">
                      {t.house_address || 'House'}
                    </h3>
                    {t.house_list_price ? (
                      <span className="text-xs text-ink-500">
                        ${Number(t.house_list_price).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-ink-600">
                    {t.client_name}
                    {t.preferred_when ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
                        Requested: {prettyWhen(t.preferred_when)}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-ink-400">
                        No time requested
                      </span>
                    )}
                  </div>
                  {t.notes ? (
                    <p className="mt-2 text-sm italic text-ink-500">"{t.notes}"</p>
                  ) : null}

                  {/* Realtor can set / change the tour time before confirming. */}
                  <label className="mt-3 block">
                    <span className="block text-[11px] font-medium text-ink-500">
                      Confirm for this date &amp; time
                    </span>
                    <input
                      type="datetime-local"
                      className="input mt-1 max-w-xs"
                      value={whenFor(t)}
                      onChange={(e) =>
                        setWhenEdits((m) => ({ ...m, [t.id]: e.target.value }))
                      }
                    />
                  </label>

                  <div className="mt-1.5 text-xs text-ink-400">
                    Requested {new Date(t.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2 sm:ml-4">
                  <button
                    onClick={() => act(t, 'declined')}
                    disabled={busy === t.id}
                    className="btn-secondary"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => act(t, 'confirmed')}
                    disabled={busy === t.id}
                    className="btn-primary"
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
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            Recent
          </h2>
          <div className="surface overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
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
                  <tr key={t.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {t.house_address || '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-600">{t.client_name}</td>
                    <td className="px-4 py-3 text-ink-600">
                      {prettyWhen(t.preferred_when) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {new Date(t.handled_at || t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Tour['status'] }) {
  const styles: Record<Tour['status'], string> = {
    pending: 'bg-amber-50 text-amber-800',
    confirmed: 'bg-emerald-50 text-emerald-800',
    declined: 'bg-ink-100 text-ink-600',
    cancelled: 'bg-ink-100 text-ink-500 line-through',
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
