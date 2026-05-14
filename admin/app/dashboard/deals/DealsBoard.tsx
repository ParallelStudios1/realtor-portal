'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useTransition } from 'react';

type Deal = {
  id: string;
  name: string | null;
  kind: 'buyer' | 'seller' | null;
  phase: string;
  updated_at: string;
  created_at: string;
  agreed_price: number | null;
  client: { id: string; full_name: string | null; email: string } | null;
  realtor: { id: string; full_name: string | null; email: string } | null;
};

const PHASE_DEFS = [
  { id: 'searching', label: 'Searching', tone: 'slate' },
  { id: 'offer_made', label: 'Offer made', tone: 'amber' },
  { id: 'counter_offer', label: 'Counter', tone: 'amber' },
  { id: 'under_contract', label: 'Under contract', tone: 'blue' },
  { id: 'closing', label: 'Closing', tone: 'indigo' },
  { id: 'closed', label: 'Closed', tone: 'emerald' },
] as const;

const PHASE_TONES: Record<string, { bg: string; text: string; ring: string }> = {
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800', ring: 'ring-amber-200' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-800', ring: 'ring-blue-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800', ring: 'ring-indigo-200' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-800', ring: 'ring-emerald-200' },
};

function phaseTone(phase: string) {
  const def = PHASE_DEFS.find((p) => p.id === phase);
  return PHASE_TONES[def?.tone || 'slate'];
}

export function DealsBoard({
  deals,
  counts,
  total,
  phaseFilter,
  query,
  view,
}: {
  deals: Deal[];
  counts: Record<string, number>;
  total: number;
  phaseFilter: string;
  query: string;
  view: 'list' | 'board';
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp?.toString() || '');
    if (value === null || value === '' || value === 'all') next.delete(key);
    else next.set(key, value);
    start(() => router.push('/dashboard/deals?' + next.toString()));
  }

  const grouped = useMemo(() => {
    const g: Record<string, Deal[]> = {};
    for (const p of PHASE_DEFS) g[p.id] = [];
    for (const d of deals) {
      const k = (d.phase as string) || 'searching';
      if (!g[k]) g[k] = [];
      g[k].push(d);
    }
    return g;
  }, [deals]);

  return (
    <>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip
          label="All"
          count={total}
          active={phaseFilter === 'all'}
          onClick={() => setParam('phase', null)}
        />
        {PHASE_DEFS.map((p) => (
          <FilterChip
            key={p.id}
            label={p.label}
            count={counts[p.id] || 0}
            active={phaseFilter === p.id}
            tone={p.tone}
            onClick={() => setParam('phase', p.id)}
          />
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <input
              type="search"
              defaultValue={query}
              placeholder="Search client, address, realtor…"
              className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              onChange={(e) => {
                const v = e.target.value.trim();
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(
                  () => setParam('q', v || null),
                  250
                );
              }}
            />
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
            <ViewBtn
              active={view === 'list'}
              onClick={() => setParam('view', 'list')}
              label="List"
            />
            <ViewBtn
              active={view === 'board'}
              onClick={() => setParam('view', 'board')}
              label="Board"
            />
          </div>
        </div>
      </div>

      {pending && (
        <div className="mb-2 text-xs text-slate-400">Loading…</div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="text-3xl">📋</div>
          <h3 className="mt-3 font-semibold">No deals match those filters</h3>
          <p className="mt-1 text-sm text-slate-600">
            Clear filters or invite a new client to get started.
          </p>
          <Link
            href="/dashboard/clients/new"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            + Invite client
          </Link>
        </div>
      ) : view === 'list' ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {deals.map((d) => (
            <DealCard key={d.id} d={d} />
          ))}
        </ul>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {PHASE_DEFS.map((p) => (
            <div
              key={p.id}
              className="min-w-[280px] flex-1 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      'inline-block h-2 w-2 rounded-full ' +
                      ('bg-' + p.tone + '-500')
                    }
                    style={{ backgroundColor: dotColor(p.tone) }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {p.label}
                  </span>
                </div>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {(grouped[p.id] || []).length}
                </span>
              </div>
              <ul className="space-y-2">
                {(grouped[p.id] || []).length === 0 ? (
                  <li className="rounded-lg border border-dashed border-slate-200 bg-white/50 p-3 text-center text-xs text-slate-400">
                    No deals
                  </li>
                ) : (
                  (grouped[p.id] || []).map((d) => (
                    <DealCard key={d.id} d={d} compact />
                  ))
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FilterChip({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: string;
  onClick: () => void;
}) {
  const t = tone ? PHASE_TONES[tone] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ' +
        (active
          ? 'bg-slate-900 text-white shadow-sm'
          : (t
              ? t.bg + ' ' + t.text + ' hover:opacity-80'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'))
      }
    >
      {label}
      <span
        className={
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold ' +
          (active ? 'bg-white/20' : 'bg-white/70')
        }
      >
        {count}
      </span>
    </button>
  );
}

function ViewBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-3 py-2 text-xs font-semibold transition ' +
        (active
          ? 'bg-slate-900 text-white'
          : 'bg-white text-slate-600 hover:bg-slate-50')
      }
    >
      {label}
    </button>
  );
}

function DealCard({ d, compact }: { d: Deal; compact?: boolean }) {
  const t = phaseTone(d.phase);
  const initials = (d.client?.full_name || d.client?.email || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <li>
      <Link
        href={`/dashboard/deals/${d.id}`}
        className={
          'block rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md ' +
          (compact ? 'p-3' : 'p-4')
        }
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-slate-900">
              {d.client?.full_name || d.client?.email || 'Deal'}
            </div>
            <div className="truncate text-xs text-slate-500">
              {d.name ||
                (d.kind === 'seller' ? 'Listing deal' : 'Buyer deal')}
            </div>
          </div>
          <span
            className={
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ' +
              t.bg +
              ' ' +
              t.text +
              ' ring-inset ' +
              t.ring
            }
          >
            {String(d.phase).replace(/_/g, ' ')}
          </span>
        </div>
        {!compact && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span>
              {d.agreed_price
                ? '$' + Number(d.agreed_price).toLocaleString()
                : (d.kind || 'buyer') + ' deal'}
            </span>
            <span>Updated {timeAgo(d.updated_at)}</span>
          </div>
        )}
      </Link>
    </li>
  );
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd ago';
  return new Date(iso).toLocaleDateString();
}

function dotColor(tone: string) {
  switch (tone) {
    case 'amber':
      return '#f59e0b';
    case 'blue':
      return '#3b82f6';
    case 'indigo':
      return '#6366f1';
    case 'emerald':
      return '#10b981';
    default:
      return '#94a3b8';
  }
}
