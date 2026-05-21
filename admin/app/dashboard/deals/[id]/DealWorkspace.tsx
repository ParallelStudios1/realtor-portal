'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/Toast';
import {
  ClientDetailActions,
  ParticipantList,
} from '../../clients/[id]/ClientDetailActions';
import { DocumentRow } from '../../clients/[id]/DocumentRow';
import { assignDealRealtorAction } from '../../firm/actions';

/**
 * The canonical interactive deal workspace. Compared to the old per-client
 * page this one:
 *   - Loads by deal id (not client id), so a client with multiple deals
 *     gets one workspace per deal instead of a deal-switcher pancake.
 *   - Reorganises actions into 4 logical groups instead of a flat 15-tile grid.
 *   - Hero is a single tall card with phase progress + key actions.
 *   - Right rail shows people, dates, and recent activity at a glance.
 *
 * The existing ClientDetailActions component is re-used unchanged — it's the
 * shared mutation surface across the app. We just redress what surrounds it.
 */
export function DealWorkspace(props: {
  clientId: string;
  isGuestFirm?: boolean;
  me: {
    firmId: string | null;
    userId: string;
    fullName: string | null;
    role?: string;
    canAssignRealtor?: boolean;
  };
  deal: any;
  phases: { id: string; label: string }[];
  phaseIdx: number;
  allDeals: any[];
  houses: any[];
  tours: any[];
  dates: any[];
  documents: any[];
  participants: any[];
  activity: any[];
  teammates: Array<{
    id: string;
    full_name: string | null;
    email: string;
    role?: string;
  }>;
  recentMessages: any[];
}) {
  const {
    clientId,
    isGuestFirm,
    me,
    deal,
    phases,
    phaseIdx,
    allDeals,
    houses,
    tours,
    dates,
    documents,
    participants,
    activity,
    teammates,
    recentMessages,
  } = props;

  const [docFolder, setDocFolder] = useState<string>('all');
  const [assigning, setAssigning] = useState(false);
  const [savingAssignment, startAssignment] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const folders = Array.from(
    new Set((documents || []).map((d: any) => d.folder || 'General'))
  );
  const visibleDocs =
    docFolder === 'all'
      ? documents
      : documents.filter((d: any) => (d.folder || 'General') === docFolder);

  const principal = deal.client;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* "Guest on this deal" banner — appears when this deal is hosted by
          a firm other than the viewer's own. Explains the premium-perk
          arrangement so the cross-firm collaborator understands what they
          get for free here vs. what their own firm would have to pay for. */}
      {isGuestFirm && (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 6v4M10 14h.01" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-blue-950">
              You&rsquo;re a guest on this deal
            </p>
            <p className="mt-0.5 text-xs text-blue-900/80">
              This deal is hosted by another firm. While you work on it, you
              get all of Realtor Portal&rsquo;s premium tools &mdash; documents,
              messages, tours, calendar, financials &mdash; on the host
              firm&rsquo;s plan. Your own firm&rsquo;s deals run on whatever
              plan you choose.
            </p>
          </div>
        </div>
      )}

      {/* Breadcrumb + deal switcher */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <nav className="flex items-center gap-2 text-slate-500">
          <Link
            href="/dashboard/deals"
            className="font-semibold hover:text-slate-900"
          >
            Deals
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-900">
            {principal?.full_name || principal?.email}
          </span>
        </nav>
        {allDeals.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-slate-400">Other deals:</span>
            {allDeals
              .filter((d) => d.id !== deal.id)
              .slice(0, 4)
              .map((d) => (
                <Link
                  key={d.id}
                  href={`/dashboard/deals/${d.id}`}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {d.kind === 'seller' ? '🏠' : '🔍'}{' '}
                  {(d.name || d.kind || 'deal').slice(0, 20)}
                </Link>
              ))}
          </div>
        )}
      </div>

      {/* Hero card */}
      <section className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-md">
        {/* decorative gradient header strip */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-ink-900 via-ink-800 to-blue-900" />
        <div className="relative px-6 pb-6 pt-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-ink-900 text-xl font-bold text-white shadow-soft-md">
              {initials(principal?.full_name || principal?.email)}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {principal?.full_name || principal?.email}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80">
                <a
                  href={'mailto:' + principal?.email}
                  className="hover:text-white"
                >
                  {principal?.email}
                </a>
                <span className="opacity-60">·</span>
                <span className="capitalize">{deal.kind || 'buyer'} deal</span>
                {deal.name && (
                  <>
                    <span className="opacity-60">·</span>
                    <span className="truncate">{deal.name}</span>
                  </>
                )}
                <span className="opacity-60">·</span>
                <span>
                  started {new Date(deal.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link
                href={`/deal/${deal.id}?as=client`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Client view ↗
              </Link>
              {deal.docusign_envelope_url && (
                <a
                  href={deal.docusign_envelope_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 shadow-soft-sm transition hover:bg-amber-300"
                >
                  Open DocuSign ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Phase progress */}
        <div className="border-t border-ink-200 bg-white px-6 py-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
              Deal phase
            </h2>
            <span className="text-xs text-ink-500">
              Currently{' '}
              <strong className="capitalize text-ink-900">
                {String(deal.phase).replace(/_/g, ' ')}
              </strong>
            </span>
          </div>
          <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {phases.map((p, i) => {
              const done = phaseIdx > 0 && i < phaseIdx;
              const isCurrent = i === phaseIdx;
              return (
                <li
                  key={p.id}
                  className={
                    'relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition ' +
                    (isCurrent
                      ? 'border-blue-500 bg-blue-50 font-semibold text-blue-900 shadow-soft-sm ring-2 ring-blue-100'
                      : done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-ink-200 bg-white text-ink-500')
                  }
                >
                  <span
                    className={
                      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ' +
                      (done
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white'
                        : 'bg-ink-200 text-ink-500')
                    }
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className="truncate">{p.label}</span>
                  {isCurrent && (
                    <span
                      aria-hidden
                      className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Realtor assignment — owners / firm_admins / managers only. */}
      {me.canAssignRealtor && (
        <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-soft-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 11h-6M19 8v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Assigned realtor
              </div>
              <div className="text-sm font-semibold text-ink-900">
                {deal.realtor?.full_name || deal.realtor?.email || (
                  <span className="text-amber-700">Unassigned</span>
                )}
              </div>
            </div>
          </div>
          {assigning ? (
            <div className="flex items-center gap-2">
              <select
                defaultValue={deal.realtor_id || ''}
                disabled={savingAssignment}
                onChange={(e) => {
                  const v = e.target.value || null;
                  startAssignment(async () => {
                    const r = await assignDealRealtorAction({
                      search_id: deal.id,
                      realtor_id: v,
                    });
                    if (!r.ok) {
                      toast.show(r.error || 'Failed', { variant: 'error' });
                      return;
                    }
                    toast.show('Deal reassigned.', { variant: 'success' });
                    setAssigning(false);
                    router.refresh();
                  });
                }}
                className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {teammates
                  .filter((t) =>
                    ['realtor', 'firm_admin', 'owner', 'manager'].includes(
                      t.role || ''
                    )
                  )
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name || t.email}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => setAssigning(false)}
                className="btn-ghost text-xs px-2 py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAssigning(true)}
              className="btn-secondary text-xs"
            >
              {deal.realtor_id ? 'Reassign' : 'Assign realtor'}
            </button>
          )}
        </section>
      )}

      {/* Action surface — the existing component already groups actions well */}
      <div className="mt-6">
        <ClientDetailActions
          clientId={clientId}
          firmId={me.firmId!}
          searchId={deal.id}
          currentPhase={deal.phase}
          financials={{
            agreed_price: deal.agreed_price ?? null,
            closing_amount: deal.closing_amount ?? null,
            earnest_money: deal.earnest_money ?? null,
            commission_pct: deal.commission_pct ?? null,
            contract_url: deal.contract_url ?? null,
            notes: deal.notes ?? null,
          }}
          teammates={teammates as any}
        />
      </div>

      {/* Body grid */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Houses */}
          <Card
            title={`Houses (${houses.length})`}
            empty={houses.length === 0 ? 'No houses yet — use Add house above.' : null}
          >
            <ul className="divide-y divide-slate-100">
              {houses.map((h: any) => (
                <li
                  key={h.id}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  {h.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={h.photo_url}
                      alt={h.address}
                      className="h-14 w-20 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-20 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                      🏠
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.address}</div>
                    <div className="text-xs text-slate-500">
                      {h.list_price
                        ? '$' + Number(h.list_price).toLocaleString()
                        : 'No price'}
                      {h.status && h.status !== 'active'
                        ? ' · ' + String(h.status).replace(/_/g, ' ')
                        : ''}
                    </div>
                  </div>
                  {h.listing_url && (
                    <a
                      href={h.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-700 hover:underline"
                    >
                      Listing ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {/* Tour requests — only show if any */}
          {tours.length > 0 && (
            <Card title={`Tour requests (${tours.length})`}>
              <ul className="divide-y divide-slate-100">
                {tours.map((t: any) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t.house?.address || '(house gone)'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {t.preferred_when
                          ? 'Asked for ' + t.preferred_when + ' · '
                          : ''}
                        {new Date(t.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      className={
                        'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ' +
                        (t.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'declined' || t.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800')
                      }
                    >
                      {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Documents — folder filter */}
          <Card
            title={`Documents (${documents.length})`}
            right={
              folders.length > 1 ? (
                <select
                  value={docFolder}
                  onChange={(e) => setDocFolder(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                >
                  <option value="all">All folders</option>
                  {folders.map((f) => (
                    <option key={f as string} value={f as string}>
                      {f as string}
                    </option>
                  ))}
                </select>
              ) : null
            }
            empty={
              documents.length === 0
                ? 'No documents yet — use Upload doc above.'
                : null
            }
          >
            <ul className="divide-y divide-slate-100 px-3 py-2">
              {visibleDocs.map((d: any) => (
                <DocumentRow key={d.id} clientId={clientId} doc={d as any} />
              ))}
            </ul>
            <div className="border-t border-slate-100 px-5 py-2 text-right">
              <Link
                href={`/dashboard/clients/${clientId}/upload?searchId=${deal.id}`}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + Upload more →
              </Link>
            </div>
          </Card>

          {/* Activity timeline */}
          <Card title="Activity">
            {activity.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-slate-500">
                Nothing yet — actions you take here show up in this timeline.
              </div>
            ) : (
              <ol className="divide-y divide-slate-100">
                {activity.map((a: any) => (
                  <li
                    key={a.id}
                    className="flex items-baseline gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span className="font-medium capitalize">
                      {String(a.action).replace(/_/g, ' ')}
                    </span>
                    <span className="truncate text-slate-600">{a.target}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">
                      {timeAgoShort(a.created_at)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <aside className="space-y-6">
          {/* Financials snapshot */}
          <Card title="Financials">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-5 py-4 text-sm">
              <FRow label="Agreed price" value={deal.agreed_price} money />
              <FRow label="Closing" value={deal.closing_amount} money />
              <FRow label="Earnest" value={deal.earnest_money} money />
              <FRow
                label="Commission"
                value={
                  deal.commission_pct != null ? deal.commission_pct + '%' : null
                }
              />
            </dl>
            {!deal.agreed_price &&
              !deal.closing_amount &&
              !deal.earnest_money &&
              deal.commission_pct == null && (
                <p className="px-5 pb-4 text-xs italic text-slate-500">
                  Use Financials above to fill these in.
                </p>
              )}
          </Card>

          {/* Important dates */}
          <Card title={`Important dates (${dates.length})`}>
            {dates.length === 0 ? (
              <p className="px-5 py-4 text-xs italic text-ink-500">
                None yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {dates.map((d: any) => (
                  <li key={d.id} className="px-5 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-xs font-semibold text-ink-700">
                        {new Date(d.date).toLocaleDateString()}
                        {d.event_time ? ' · ' + formatTime(d.event_time) : ''}
                      </span>
                    </div>
                    {(d.location || d.things_to_bring) && (
                      <div className="mt-1 space-y-0.5 text-[11px] text-ink-500">
                        {d.location && (
                          <div className="flex items-start gap-1">
                            <span aria-hidden>📍</span>
                            <span className="break-words">{d.location}</span>
                          </div>
                        )}
                        {d.things_to_bring && (
                          <div className="flex items-start gap-1">
                            <span aria-hidden>📋</span>
                            <span className="break-words">
                              Bring: {d.things_to_bring}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-1 text-right">
                      <a
                        href={`/api/calendar/event/${d.id}`}
                        className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 hover:underline"
                      >
                        Add to calendar ↗
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-ink-100 px-5 py-2 text-right">
              <a
                href={`/api/calendar/${deal.id}.ics`}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Subscribe to all ↗
              </a>
            </div>
          </Card>

          {/* People on the deal */}
          <Card title={`People (${participants.length + 1})`}>
            <div className="space-y-3 px-5 py-4 text-sm">
              <PersonRow
                label="Client"
                name={principal?.full_name || principal?.email}
                email={principal?.email}
                tone="slate"
              />
              {deal.attorney_name && (
                <PersonRow
                  label="Attorney"
                  name={deal.attorney_name}
                  email={deal.attorney_email}
                  phone={deal.attorney_phone}
                  tone="purple"
                />
              )}
              <ParticipantList
                clientId={clientId}
                searchId={deal.id}
                participants={(participants || []) as any}
              />
            </div>
          </Card>

          {/* Recent messages */}
          {recentMessages.length > 0 && (
            <Card title="Recent messages">
              <ul className="divide-y divide-slate-100">
                {recentMessages.map((m: any) => {
                  const mine = m.sender_id === me.userId;
                  return (
                    <li key={m.id} className="px-5 py-2.5 text-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {mine ? 'You' : 'Client'} ·{' '}
                        {timeAgoShort(m.created_at)}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-slate-700">
                        {m.body}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-slate-100 px-5 py-2 text-right">
                <Link
                  href={`/dashboard/messages?search=${deal.id}`}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Open thread →
                </Link>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}

function Card({
  title,
  right,
  empty,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  empty?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft transition hover:shadow-soft-md">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          {title}
        </h2>
        {right}
      </div>
      {empty ? (
        <div className="bg-dotted px-5 py-10 text-center text-sm text-ink-500">
          {empty}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function FRow({
  label,
  value,
  money,
}: {
  label: string;
  value: any;
  money?: boolean;
}) {
  if (value == null || value === '') {
    return (
      <>
        <dt className="text-slate-500">{label}</dt>
        <dd className="text-right text-slate-300">—</dd>
      </>
    );
  }
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">
        {money ? '$' + Number(value).toLocaleString() : value}
      </dd>
    </>
  );
}

function PersonRow({
  label,
  name,
  email,
  phone,
  tone,
}: {
  label: string;
  name: string | null | undefined;
  email?: string | null;
  phone?: string | null;
  tone: 'slate' | 'purple';
}) {
  const colors =
    tone === 'purple'
      ? 'bg-purple-50 text-purple-800'
      : 'bg-slate-100 text-slate-700';
  return (
    <div className="flex items-start gap-3">
      <span
        className={
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
          colors
        }
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="truncate text-sm font-medium">{name || '—'}</div>
        {email && (
          <a
            href={'mailto:' + email}
            className="block truncate text-xs text-blue-600 hover:underline"
          >
            {email}
          </a>
        )}
        {phone && (
          <a
            href={'tel:' + phone}
            className="block text-xs text-blue-600 hover:underline"
          >
            {phone}
          </a>
        )}
      </div>
    </div>
  );
}

function initials(s: string | null | undefined) {
  if (!s) return '?';
  return s
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatTime(t: string): string {
  // "14:30:00" -> "2:30 PM"
  const [hStr, mStr] = (t || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr || '0');
  if (!Number.isFinite(h)) return t;
  const am = h < 12;
  const h12 = ((h + 11) % 12) + 1;
  return h12 + ':' + (m < 10 ? '0' : '') + m + (am ? ' AM' : ' PM');
}

function timeAgoShort(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 7) return d + 'd';
  return new Date(iso).toLocaleDateString();
}
