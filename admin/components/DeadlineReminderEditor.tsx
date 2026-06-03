'use client';

/**
 * Per-date deadline control. Renders inline under an important date:
 *   - Status pill (overdue / due soon / done / acknowledged).
 *   - Mark done + Acknowledge buttons.
 *   - Owner selector (firm teammates).
 *   - Expandable "Reminders" popover to add/remove reminder rules
 *     (offset days, channels, audience, escalate).
 *
 * Flat ink palette, no gradients/emoji. Async buttons show an inline
 * "Working…" state via useTransition.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  addDateReminderAction,
  removeDateReminderAction,
  completeImportantDateAction,
  acknowledgeImportantDateAction,
  setDateOwnerAction,
} from '@/app/dashboard/deals/[id]/deadlineActions';

type Channel = 'email' | 'sms' | 'in_app';
type Audience = 'staff' | 'client' | 'all_parties';

export type DeadlineDate = {
  id: string;
  label: string;
  date: string;
  completed_at?: string | null;
  acknowledged_at?: string | null;
  escalated_at?: string | null;
  owner_user_id?: string | null;
  reminders?: Array<{
    id: string;
    offset_days: number;
    channels: string[];
    audience: string;
    escalate: boolean;
  }>;
};

type Teammate = { id: string; full_name: string | null; email: string };

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'in_app', label: 'In-app' },
];
const AUDIENCES: { value: Audience; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'client', label: 'Client' },
  { value: 'all_parties', label: 'All parties' },
];

function daysUntil(date: string): number {
  const day = String(date).slice(0, 10);
  const target = new Date(day + 'T00:00:00.000Z').getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

export function DeadlineReminderEditor({
  date,
  teammates,
  me,
}: {
  date: DeadlineDate;
  teammates: Teammate[];
  // The current user. `teammates` EXCLUDES self (the page filters out me.user_id),
  // so without this a solo realtor would have nobody to assign as owner. We
  // render self at the top of the owner list and merge in teammates.
  me?: { id: string; fullName: string | null } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  // Owner options: the current user first ("… (me)"), then teammates. Dedupe
  // by id so we never render self twice if they somehow appear in teammates.
  const ownerOptions: Array<{ id: string; label: string }> = [];
  if (me?.id) {
    ownerOptions.push({
      id: me.id,
      label: (me.fullName || 'Me') + ' (me)',
    });
  }
  for (const t of teammates) {
    if (me?.id && t.id === me.id) continue;
    ownerOptions.push({ id: t.id, label: t.full_name || t.email });
  }

  const reminders = date.reminders || [];
  const completed = Boolean(date.completed_at);
  const acked = Boolean(date.acknowledged_at);
  const dUntil = daysUntil(date.date);
  const overdue = !completed && !acked && dUntil < 0;
  const dueSoon = !completed && !acked && dUntil >= 0 && dUntil <= 2;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.show(r.error || 'Failed', { variant: 'error' });
        return;
      }
      toast.show(okMsg, { variant: 'success' });
      router.refresh();
    });

  return (
    <div className="mt-2 border-t border-ink-100 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill completed={completed} acked={acked} overdue={overdue} dueSoon={dueSoon} dUntil={dUntil} />

        {!completed && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => completeImportantDateAction({ dateId: date.id }), 'Marked done.')}
            className="btn-xs"
          >
            {pending ? 'Working…' : 'Mark done'}
          </button>
        )}
        {!completed && !acked && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => acknowledgeImportantDateAction({ dateId: date.id }), 'Acknowledged.')}
            className="btn-xs"
          >
            Acknowledge
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-xs"
          aria-expanded={open}
        >
          Reminders{reminders.length > 0 ? ` (${reminders.length})` : ''}
        </button>
      </div>

      {/* Owner selector */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-500">
        <span className="font-semibold uppercase tracking-wide">Owner</span>
        <select
          value={date.owner_user_id || ''}
          disabled={pending}
          onChange={(e) =>
            run(
              () => setDateOwnerAction({ dateId: date.id, ownerUserId: e.target.value || null }),
              'Owner updated.'
            )
          }
          className="rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] text-ink-800 transition focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200 disabled:opacity-50"
        >
          <option value="">Unassigned</option>
          {ownerOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {open && (
        <RemindersPanel
          dateId={date.id}
          reminders={reminders}
          pending={pending}
          onAdd={(payload) => run(() => addDateReminderAction({ dateId: date.id, ...payload }), 'Reminder added.')}
          onRemove={(reminderId) =>
            run(() => removeDateReminderAction({ reminderId }), 'Reminder removed.')
          }
        />
      )}
    </div>
  );
}

function StatusPill({
  completed,
  acked,
  overdue,
  dueSoon,
  dUntil,
}: {
  completed: boolean;
  acked: boolean;
  overdue: boolean;
  dueSoon: boolean;
  dUntil: number;
}) {
  let cls = 'bg-ink-100 text-ink-600';
  let text = dUntil >= 0 ? `in ${dUntil}d` : `${Math.abs(dUntil)}d ago`;
  if (completed) {
    cls = 'bg-emerald-100 text-emerald-800';
    text = 'Done';
  } else if (overdue) {
    cls = 'bg-rose-100 text-rose-800';
    text = `Overdue ${Math.abs(dUntil)}d`;
  } else if (acked) {
    cls = 'bg-amber-100 text-amber-800';
    text = 'Acknowledged';
  } else if (dueSoon) {
    cls = 'bg-amber-100 text-amber-800';
    text = dUntil === 0 ? 'Due today' : `Due in ${dUntil}d`;
  }
  return <span className={'chip-xs ' + cls}>{text}</span>;
}

function RemindersPanel({
  reminders,
  pending,
  onAdd,
  onRemove,
}: {
  dateId: string;
  reminders: DeadlineDate['reminders'];
  pending: boolean;
  onAdd: (payload: {
    offsetDays: number;
    channels: Channel[];
    audience: Audience;
    escalate: boolean;
  }) => void;
  onRemove: (reminderId: string) => void;
}) {
  const [offset, setOffset] = useState(3);
  const [channels, setChannels] = useState<Channel[]>(['email', 'in_app']);
  const [audience, setAudience] = useState<Audience>('staff');
  const [escalate, setEscalate] = useState(true);

  const toggleChannel = (c: Channel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 p-3 text-[11px]">
      {(reminders || []).length > 0 && (
        <ul className="mb-2.5 space-y-1.5">
          {(reminders || []).map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-1.5"
            >
              <span className="text-ink-700">
                {r.offset_days}d before · {(r.channels || []).join(', ')} · {r.audience}
                {r.escalate ? ' · escalates' : ''}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(r.id)}
                className="shrink-0 font-semibold text-ink-400 transition hover:text-rose-600 disabled:opacity-50"
                aria-label="Remove reminder"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-wide text-ink-500">Days before</span>
          <input
            type="number"
            min={0}
            max={60}
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            className="w-14 rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-ink-800 transition focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
          />
        </label>
        <div className="flex items-center gap-1">
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => toggleChannel(c.value)}
              aria-pressed={channels.includes(c.value)}
              className={
                'rounded-md border px-2 py-0.5 font-semibold transition active:scale-[0.98] ' +
                (channels.includes(c.value)
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50')
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        <select
          value={audience}
          onChange={(e) => setAudience(e.target.value as Audience)}
          className="rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-ink-800 transition focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-200"
        >
          {AUDIENCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 font-medium text-ink-600">
          <input
            type="checkbox"
            checked={escalate}
            onChange={(e) => setEscalate(e.target.checked)}
            className="accent-ink-900"
          />
          Escalate
        </label>
        <button
          type="button"
          disabled={pending || channels.length === 0}
          onClick={() => onAdd({ offsetDays: offset, channels, audience, escalate })}
          className="btn-xs-solid ml-auto"
        >
          {pending ? 'Working…' : 'Add reminder'}
        </button>
      </div>
    </div>
  );
}
