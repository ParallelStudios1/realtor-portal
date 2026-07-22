'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  createReminderScheduleAction,
  deleteReminderScheduleAction,
  toggleReminderScheduleAction,
} from './actions';

export type ClientOption = {
  searchId: string;
  userId: string | null;
  email: string | null;
  label: string;
};

export type ScheduleRow = {
  id: string;
  audience: 'client' | 'all_clients';
  title: string | null;
  message: string;
  channels: string[] | null;
  cadence: 'once' | 'monthly' | 'annual';
  day_of_month: number | null;
  month: number | null;
  next_run: string;
  active: boolean;
  recipient_email: string | null;
  search_id: string | null;
};

const CHANNELS: { v: string; t: string }[] = [
  { v: 'in_app', t: 'In-app' },
  { v: 'email', t: 'Email' },
  { v: 'sms', t: 'Text' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function RemindersClient({
  clients,
  schedules,
}: {
  clients: ClientOption[];
  schedules: ScheduleRow[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [audience, setAudience] = useState<'client' | 'all_clients'>('all_clients');
  const [searchId, setSearchId] = useState<string>(clients[0]?.searchId || '');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState<Record<string, boolean>>({ in_app: true });
  const [cadence, setCadence] = useState<'once' | 'monthly' | 'annual'>('annual');
  const [onceDate, setOnceDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(25);
  const [month, setMonth] = useState(12);
  const [pending, setPending] = useState(false);

  async function submit() {
    const chosen = Object.keys(channels).filter((c) => channels[c]);
    if (!message.trim()) {
      toast.show('Write a message first.', { variant: 'error' });
      return;
    }
    if (chosen.length === 0) {
      toast.show('Pick at least one channel.', { variant: 'error' });
      return;
    }
    const selected = clients.find((c) => c.searchId === searchId);
    setPending(true);
    const r = await createReminderScheduleAction({
      audience,
      searchId: audience === 'client' ? searchId : null,
      recipientUserId: audience === 'client' ? selected?.userId ?? null : null,
      recipientEmail: audience === 'client' ? selected?.email ?? null : null,
      title: title || null,
      message,
      channels: chosen,
      cadence,
      onceDate: cadence === 'once' ? onceDate : null,
      dayOfMonth: cadence === 'once' ? null : dayOfMonth,
      month: cadence === 'annual' ? month : null,
    });
    setPending(false);
    if (r.ok) {
      toast.show('Reminder scheduled.', { variant: 'success' });
      setTitle('');
      setMessage('');
      router.refresh();
    } else {
      toast.show(r.error, { variant: 'error' });
    }
  }

  async function remove(id: string) {
    const r = await deleteReminderScheduleAction(id);
    if (r.ok) {
      toast.show('Reminder deleted.', { variant: 'success' });
      router.refresh();
    } else toast.show(r.error, { variant: 'error' });
  }

  async function toggle(id: string, active: boolean) {
    const r = await toggleReminderScheduleAction(id, active);
    if (r.ok) router.refresh();
    else toast.show(r.error, { variant: 'error' });
  }

  function cadenceLabel(s: ScheduleRow): string {
    if (s.cadence === 'once') return 'Once on ' + s.next_run;
    if (s.cadence === 'monthly') return 'Monthly on day ' + (s.day_of_month || '?');
    return 'Every ' + (MONTHS[(s.month || 1) - 1] || '') + ' ' + (s.day_of_month || '');
  }

  return (
    <div className="space-y-8">
      {/* Create form */}
      <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Send to
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {[
              { v: 'all_clients' as const, t: 'All my clients' },
              { v: 'client' as const, t: 'One client' },
            ].map((opt) => (
              <label
                key={opt.v}
                className={
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ' +
                  (audience === opt.v ? 'border-ink-900 bg-ink-50' : 'border-ink-200')
                }
              >
                <input
                  type="radio"
                  name="reminder-audience"
                  checked={audience === opt.v}
                  onChange={() => setAudience(opt.v)}
                />
                {opt.t}
              </label>
            ))}
          </div>
          {audience === 'client' && (
            <select
              className="mt-2 w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
            >
              {clients.length === 0 ? (
                <option value="">No clients yet</option>
              ) : (
                clients.map((c) => (
                  <option key={c.searchId} value={c.searchId}>
                    {c.label}
                  </option>
                ))
              )}
            </select>
          )}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Title (optional)
          </span>
          <input
            className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Happy holidays!"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Message
          </span>
          <textarea
            className="w-full rounded-md border border-ink-300 px-3 py-2 text-sm"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Merry Christmas! Thank you for trusting me with your home this year."
          />
          <span className="mt-1 block text-xs text-ink-400">
            Delivered as &ldquo;{'{'}your name{'}'} wants to say: {message || '…'}&rdquo;
          </span>
        </label>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            How to send
          </span>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <label
                key={c.v}
                className={
                  'flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ' +
                  (channels[c.v] ? 'border-ink-900 bg-ink-50' : 'border-ink-200')
                }
              >
                <input
                  type="checkbox"
                  checked={!!channels[c.v]}
                  onChange={(e) => setChannels((p) => ({ ...p, [c.v]: e.target.checked }))}
                />
                {c.t}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            When
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-ink-300 px-3 py-2 text-sm"
              value={cadence}
              onChange={(e) => setCadence(e.target.value as any)}
            >
              <option value="annual">Every year</option>
              <option value="monthly">Every month</option>
              <option value="once">One time</option>
            </select>

            {cadence === 'annual' && (
              <>
                <select
                  className="rounded-md border border-ink-300 px-3 py-2 text-sm"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="w-20 rounded-md border border-ink-300 px-3 py-2 text-sm"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                />
              </>
            )}
            {cadence === 'monthly' && (
              <span className="flex items-center gap-2 text-sm text-ink-600">
                on day
                <input
                  type="number"
                  min={1}
                  max={31}
                  className="w-20 rounded-md border border-ink-300 px-3 py-2 text-sm"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                />
              </span>
            )}
            {cadence === 'once' && (
              <input
                type="date"
                className="rounded-md border border-ink-300 px-3 py-2 text-sm"
                value={onceDate}
                onChange={(e) => setOnceDate(e.target.value)}
              />
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:opacity-50"
        >
          {pending ? 'Scheduling…' : 'Schedule reminder'}
        </button>
      </section>

      {/* Existing schedules */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Scheduled ({schedules.length})
        </h2>
        {schedules.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-sm text-ink-400">
            No reminders scheduled yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {schedules.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-ink-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-800">
                    {s.title || s.message.slice(0, 48)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">{s.message}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {s.audience === 'all_clients' ? 'All clients' : 'One client'} ·{' '}
                    {cadenceLabel(s)} · {(s.channels || []).join(', ')} · next{' '}
                    {s.next_run}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(s.id, !s.active)}
                    className={
                      'rounded-md px-2 py-1 text-xs font-medium ' +
                      (s.active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-ink-100 text-ink-500')
                    }
                  >
                    {s.active ? 'Active' : 'Paused'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="rounded-md px-2 py-1 text-xs text-ink-400 hover:text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
