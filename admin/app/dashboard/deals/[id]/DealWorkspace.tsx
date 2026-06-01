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
import {
  scheduleShowingAction,
  rescheduleShowingAction,
  updateShowingStatusAction,
  type ShowingAttendee,
} from '../../clients/[id]/actions';
import { DeadlineReminderEditor } from '@/components/DeadlineReminderEditor';
import { ShowingFeedbackPanel } from './ShowingFeedbackPanel';
import { EsignPanel } from './EsignPanel';
import { ExtractReview, type StagedExtraction } from './ExtractReview';

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
  showings?: any[];
  envelopes?: any[];
  calendarUrl?: string | null;
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
    showings,
  } = props;

  const [docFolder, setDocFolder] = useState<string>('all');
  const [assigning, setAssigning] = useState(false);
  const [savingAssignment, startAssignment] = useTransition();
  const [showingModal, setShowingModal] = useState<
    | { mode: 'new' }
    | { mode: 'edit'; showing: any }
    | null
  >(null);
  const [, startShowingMutation] = useTransition();
  const [review, setReview] = useState<{ ex: StagedExtraction; name: string } | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function extractDates(doc: any) {
    setExtractingId(doc.id);
    try {
      const r = await fetch('/api/ai/contract-extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ searchId: deal.id, documentId: doc.id }),
      });
      const json = await r.json();
      if (!r.ok) {
        toast.show(json?.error || 'Could not extract dates.', { variant: 'error' });
        return;
      }
      setReview({ ex: json.extraction as StagedExtraction, name: doc.name });
    } catch (err: any) {
      toast.show(err?.message || 'Could not extract dates.', { variant: 'error' });
    } finally {
      setExtractingId(null);
    }
  }

  const upcomingShowings = (showings || []) as any[];

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
        <nav className="flex items-center gap-2 text-ink-500">
          <Link
            href="/dashboard/deals"
            className="font-semibold hover:text-ink-900"
          >
            Deals
          </Link>
          <span>/</span>
          <span className="font-semibold text-ink-900">
            {principal?.full_name || principal?.email}
          </span>
        </nav>
        {allDeals.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-ink-400">Other deals:</span>
            {allDeals
              .filter((d) => d.id !== deal.id)
              .slice(0, 4)
              .map((d) => (
                <Link
                  key={d.id}
                  href={`/dashboard/deals/${d.id}`}
                  className="rounded-full border border-ink-200 bg-white px-2.5 py-1 font-semibold text-ink-700 hover:bg-ink-50"
                >
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    {d.kind === 'seller' ? 'Sell' : 'Buy'}
                  </span>
                  {(d.name || d.kind || 'deal').slice(0, 20)}
                </Link>
              ))}
          </div>
        )}
      </div>

      {/* Hero card */}
      <section className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-md">
        {/* solid header strip */}
        <div className="absolute inset-x-0 top-0 h-24 bg-ink-900" />
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
                    {done ? (
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      i + 1
                    )}
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700">
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
            right={
              houses.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowingModal({ mode: 'new' })}
                  className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-soft-xs transition hover:bg-blue-700"
                >
                  + Schedule showing
                </button>
              ) : null
            }
            empty={houses.length === 0 ? 'No houses yet — use Add house above.' : null}
          >
            <ul className="divide-y divide-ink-100">
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
                    <div className="flex h-14 w-20 items-center justify-center rounded-md bg-ink-100 text-ink-400">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 11l9-7 9 7M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.address}</div>
                    <div className="text-xs text-ink-500">
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

          {/* Showings — upcoming, scheduled-ascending. */}
          <Card
            title={`Showings (${upcomingShowings.length})`}
            right={
              <button
                type="button"
                onClick={() => setShowingModal({ mode: 'new' })}
                disabled={houses.length === 0}
                className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-soft-xs transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  houses.length === 0
                    ? 'Add a house first so you can schedule a showing for it.'
                    : 'Schedule a showing'
                }
              >
                + Schedule showing
              </button>
            }
            empty={
              upcomingShowings.length === 0
                ? 'No upcoming showings — use Schedule showing above.'
                : null
            }
          >
            <ul className="divide-y divide-ink-100">
              {upcomingShowings.map((s: any) => {
                const when = new Date(s.scheduled_at);
                const address =
                  s.house?.address || s.location || '(unspecified)';
                const attendeeCount = Array.isArray(s.attendees)
                  ? s.attendees.length
                  : 0;
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-start gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {address}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {when.toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        @{' '}
                        {when.toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}{' '}
                        · {s.duration_minutes || 30} min
                        {attendeeCount > 0
                          ? ' · ' +
                            attendeeCount +
                            ' attendee' +
                            (attendeeCount === 1 ? '' : 's')
                          : ''}
                      </div>
                      {s.location && s.location !== s.house?.address && (
                        <div className="mt-0.5 truncate text-[11px] text-ink-400">
                          {s.location}
                        </div>
                      )}
                    </div>
                    <span
                      className={
                        'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ' +
                        (s.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.status === 'completed'
                          ? 'bg-ink-200 text-ink-700'
                          : s.status === 'canceled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800')
                      }
                    >
                      {s.status}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setShowingModal({ mode: 'edit', showing: s })}
                        className="rounded-md border border-ink-200 bg-white px-2 py-1 text-ink-700 transition hover:bg-ink-50"
                      >
                        Reschedule
                      </button>
                      {s.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() =>
                            startShowingMutation(async () => {
                              const r = await updateShowingStatusAction(
                                clientId,
                                {
                                  showing_id: s.id,
                                  status: 'completed',
                                }
                              );
                              if (!r.ok) {
                                toast.show(r.error || 'Failed', {
                                  variant: 'error',
                                });
                                return;
                              }
                              toast.show('Marked complete.', {
                                variant: 'success',
                              });
                              router.refresh();
                            })
                          }
                          className="rounded-md bg-emerald-600 px-2 py-1 text-white transition hover:bg-emerald-700"
                        >
                          Mark complete
                        </button>
                      )}
                    </div>
                    <div className="w-full">
                      <ShowingFeedbackPanel
                        clientId={clientId}
                        showingId={s.id}
                        feedbackRequestedAt={s.feedback_requested_at ?? null}
                        address={address}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Tour requests — only show if any */}
          {tours.length > 0 && (
            <Card title={`Tour requests (${tours.length})`}>
              <ul className="divide-y divide-ink-100">
                {tours.map((t: any) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t.house?.address || '(house gone)'}
                      </div>
                      <div className="text-xs text-ink-500">
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
                  className="rounded-md border border-ink-300 bg-white px-2 py-1 text-xs"
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
            <ul className="divide-y divide-ink-100 px-3 py-2">
              {visibleDocs.map((d: any) => (
                <div key={d.id}>
                  <DocumentRow clientId={clientId} doc={d as any} />
                  <div className="px-2 pb-2 text-right">
                    <button
                      type="button"
                      onClick={() => extractDates(d)}
                      disabled={extractingId === d.id}
                      className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 transition hover:underline disabled:opacity-50"
                    >
                      {extractingId === d.id
                        ? 'Extracting…'
                        : 'Extract dates from contract'}
                    </button>
                  </div>
                </div>
              ))}
            </ul>
            <div className="border-t border-ink-100 px-5 py-2 text-right">
              <Link
                href={`/dashboard/clients/${clientId}/upload?searchId=${deal.id}`}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + Upload more →
              </Link>
            </div>
          </Card>

          {/* E-signature (DocuSign) */}
          <EsignPanel
            searchId={deal.id}
            documents={documents.map((d: any) => ({
              id: d.id,
              name: d.name,
              storage_path: d.storage_path,
            }))}
            envelopes={props.envelopes || []}
          />

          {/* Activity timeline */}
          <Card title="Activity">
            {activity.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-ink-500">
                Nothing yet — actions you take here show up in this timeline.
              </div>
            ) : (
              <ol className="divide-y divide-ink-100">
                {activity.map((a: any) => (
                  <li
                    key={a.id}
                    className="flex items-baseline gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    <span className="font-medium capitalize">
                      {String(a.action).replace(/_/g, ' ')}
                    </span>
                    <span className="truncate text-ink-600">{a.target}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-400">
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
                <p className="px-5 pb-4 text-xs italic text-ink-500">
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
                          <div className="flex items-start gap-1.5">
                            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 21s7-6.6 7-11a7 7 0 10-14 0c0 4.4 7 11 7 11z" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="10" r="2.5" />
                            </svg>
                            <span className="break-words">{d.location}</span>
                          </div>
                        )}
                        {d.things_to_bring && (
                          <div className="flex items-start gap-1.5">
                            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="6" y="4" width="12" height="16" rx="2" />
                              <path d="M9 4V3h6v1M9 9h6M9 13h6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
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
                    <DeadlineReminderEditor date={d} teammates={teammates} />
                  </li>
                ))}
              </ul>
            )}
            {props.calendarUrl && (
              <div className="border-t border-ink-100 px-5 py-2 text-right">
                <a
                  href={props.calendarUrl.replace(/^https:\/\//, 'webcal://')}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Subscribe to all ↗
                </a>
              </div>
            )}
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
              <ul className="divide-y divide-ink-100">
                {recentMessages.map((m: any) => {
                  const mine = m.sender_id === me.userId;
                  return (
                    <li key={m.id} className="px-5 py-2.5 text-sm">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                        {mine ? 'You' : 'Client'} ·{' '}
                        {timeAgoShort(m.created_at)}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-ink-700">
                        {m.body}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-ink-100 px-5 py-2 text-right">
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

      {showingModal && (
        <ShowingModal
          mode={showingModal.mode}
          houses={houses as any}
          initial={showingModal.mode === 'edit' ? showingModal.showing : null}
          onClose={() => setShowingModal(null)}
          onSubmit={async (payload) => {
            if (showingModal.mode === 'edit') {
              const r = await rescheduleShowingAction(clientId, {
                showing_id: showingModal.showing.id,
                scheduled_at: payload.scheduled_at,
                duration_minutes: payload.duration_minutes,
                location: payload.location,
                notes: payload.notes,
              });
              if (!r.ok) {
                toast.show(r.error || 'Failed', { variant: 'error' });
                return;
              }
              toast.show('Showing rescheduled.', { variant: 'success' });
            } else {
              const r = await scheduleShowingAction(clientId, payload);
              if (!r.ok) {
                toast.show(r.error || 'Failed', { variant: 'error' });
                return;
              }
              toast.show('Showing scheduled — everyone was notified.', {
                variant: 'success',
              });
            }
            setShowingModal(null);
            router.refresh();
          }}
        />
      )}

      {review && (
        <ExtractReview
          extraction={review.ex}
          documentName={review.name}
          onClose={() => setReview(null)}
        />
      )}
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
        <dt className="text-ink-500">{label}</dt>
        <dd className="text-right text-ink-300">—</dd>
      </>
    );
  }
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold text-ink-900">
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
      ? 'bg-blue-50 text-blue-800'
      : 'bg-ink-100 text-ink-700';
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
        <div className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
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

/**
 * "Schedule a showing" modal. Picks a house from the deal's houses (defaults
 * to the first one), datetime, duration (15/30/45/60), location (defaults to
 * the house's address once a house is picked), notes. On submit, calls the
 * server action via the parent's onSubmit.
 *
 * Also handles edit/reschedule — when initial is supplied, the form
 * preloads the existing values and the house picker is locked (rescheduling
 * a showing of a different house should be a new showing).
 */
function ShowingModal({
  mode,
  houses,
  initial,
  onClose,
  onSubmit,
}: {
  mode: 'new' | 'edit';
  houses: any[];
  initial: any | null;
  onClose: () => void;
  onSubmit: (payload: {
    house_id?: string | null;
    scheduled_at: string;
    duration_minutes: number;
    location?: string | null;
    notes?: string | null;
    attendees?: { name?: string | null; email?: string | null; phone?: string | null }[];
  }) => Promise<void>;
}) {
  const DURATIONS = [15, 30, 45, 60];

  const initialHouseId: string | null =
    initial?.house_id ?? (houses[0]?.id ?? null);
  const initialDateTime = initial?.scheduled_at
    ? toLocalInputValue(new Date(initial.scheduled_at))
    : '';

  const [houseId, setHouseId] = useState<string | null>(initialHouseId);
  const [dateTime, setDateTime] = useState<string>(initialDateTime);
  const [duration, setDuration] = useState<number>(
    initial?.duration_minutes || 30
  );
  const initialHouse = houses.find((h) => h.id === initialHouseId);
  const [location, setLocation] = useState<string>(
    initial?.location ?? (initialHouse?.address || '')
  );
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const initialAttendees: ShowingAttendee[] = Array.isArray(initial?.attendees)
    ? (initial.attendees as ShowingAttendee[])
    : [];
  const [attendees, setAttendees] =
    useState<ShowingAttendee[]>(initialAttendees);
  const [pending, start] = useTransition();

  function patchAttendee(i: number, key: keyof ShowingAttendee, v: string) {
    setAttendees((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, [key]: v } : a))
    );
  }

  const submittable = Boolean(dateTime) && (mode === 'edit' || Boolean(houseId));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white shadow-soft-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <h3 className="text-base font-bold tracking-tight text-ink-900">
            {mode === 'edit' ? 'Reschedule showing' : 'Schedule a showing'}
          </h3>
          <button
            onClick={onClose}
            className="-mr-1.5 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3 p-5">
          {mode === 'new' && (
            <ModalField label="House">
              <select
                className={modalInputCls}
                value={houseId || ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setHouseId(v);
                  // Auto-fill location with the picked house's address if the
                  // user hasn't typed something custom yet.
                  const h = houses.find((x) => x.id === v);
                  if (h && (!location || houses.some((x) => x.address === location))) {
                    setLocation(h.address || '');
                  }
                }}
              >
                {houses.length === 0 && (
                  <option value="">(no houses on this deal yet)</option>
                )}
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.address}
                  </option>
                ))}
              </select>
            </ModalField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="When">
              <input
                type="datetime-local"
                className={modalInputCls}
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
              />
            </ModalField>
            <ModalField label="Duration">
              <div className="flex gap-1">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={
                      'flex-1 rounded-md border px-2 py-2 text-xs font-semibold transition ' +
                      (duration === d
                        ? 'border-blue-600 bg-blue-50 text-blue-900'
                        : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50')
                    }
                  >
                    {d}m
                  </button>
                ))}
              </div>
            </ModalField>
          </div>
          <ModalField
            label="Location"
            hint="Defaults to the house address. Override for lockbox info, meeting points, etc."
          >
            <input
              className={modalInputCls}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="123 Main St, Unit 4 — meet at the lockbox"
            />
          </ModalField>
          <ModalField label="Notes (optional)">
            <textarea
              className={modalInputCls}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Bring photo ID, allow 10 min for parking…"
            />
          </ModalField>

          {mode === 'new' && (
            <ModalField
              label="Extra attendees (optional)"
              hint="Co-buyers, family, inspectors — anyone not already on the deal."
            >
              <div className="space-y-2">
                {attendees.map((a, i) => (
                  <div key={i} className="grid grid-cols-3 gap-1.5">
                    <input
                      className={modalInputCls + ' text-xs'}
                      placeholder="Name"
                      value={a.name || ''}
                      onChange={(e) => patchAttendee(i, 'name', e.target.value)}
                    />
                    <input
                      className={modalInputCls + ' text-xs'}
                      placeholder="Email"
                      value={a.email || ''}
                      onChange={(e) => patchAttendee(i, 'email', e.target.value)}
                    />
                    <input
                      className={modalInputCls + ' text-xs'}
                      placeholder="Phone"
                      value={a.phone || ''}
                      onChange={(e) => patchAttendee(i, 'phone', e.target.value)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setAttendees((prev) => [
                      ...prev,
                      { name: '', email: '', phone: '' },
                    ])
                  }
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  + Add another attendee
                </button>
              </div>
            </ModalField>
          )}
        </div>
        <div className="border-t border-ink-100 p-5">
          <button
            type="button"
            disabled={pending || !submittable}
            onClick={() =>
              start(async () => {
                const payload = {
                  house_id: mode === 'edit' ? undefined : houseId,
                  scheduled_at: new Date(dateTime).toISOString(),
                  duration_minutes: duration,
                  location: location.trim() || null,
                  notes: notes.trim() || null,
                  attendees:
                    mode === 'edit'
                      ? undefined
                      : attendees.filter(
                          (a) => a.name || a.email || a.phone
                        ),
                };
                await onSubmit(payload);
              })
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-soft-sm transition hover:bg-ink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending
              ? 'Working…'
              : mode === 'edit'
              ? 'Save new time'
              : 'Schedule showing'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
    </label>
  );
}

const modalInputCls =
  'w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm shadow-soft-xs transition placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10';

/**
 * Convert a Date to the value expected by <input type="datetime-local">.
 * That input wants "YYYY-MM-DDTHH:MM" in the user's LOCAL time, not ISO UTC.
 */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}
