import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { buildCalendarFeedUrl } from '@/lib/ics';
import { formatDateOnly } from '@/lib/dates';
import { AgreedHomeCard } from '@/components/AgreedHomeCard';
import { AttorneyDocList, type AttorneyDoc } from '@/components/AttorneyDocList';
import { DealChat } from '@/components/DealChat';
import { PrivateMessages } from '@/components/PrivateMessages';
import { getPrivateParties } from '@/app/dashboard/deals/[id]/privateActions';
import {
  getDealChat,
  type DealChatMessage,
} from '@/app/dashboard/deals/[id]/chatActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Deal' };

const PHASES = [
  'searching',
  'awaiting_offer',
  'offer_made',
  'under_contract',
  'closing',
  'closed',
] as const;

/**
 * Universal deal page. Each party (realtor, buyer, seller, attorney, etc.)
 * lands here and gets a role-scoped view based on:
 *   - their `deal_participants` row + visibility flags
 *   - whether they're staff in the firm (then they see everything)
 *
 * Designed to look the same to everyone: branded card, phase stepper,
 * roster of who's on the deal, sections gated by visibility flags.
 */
export default async function DealPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { as?: string };
}) {
  const me = await getMe();
  if (!me?.user_id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-50 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-soft-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-6 w-6 text-ink-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            Sign in to view this deal
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            This deal is private. Sign in with the email it was shared with.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/deal/' + params.id)}`}
            className="btn-primary mt-6 w-full justify-center"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const service = getSupabaseServiceRoleClient();

  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, name, phase, kind, agreed_price, closing_amount, earnest_money,
       commission_pct, contract_url, attorney_email, attorney_name, notes, created_at,
       closing_date, offer_house_id, house_agreed_at,
       firm:firms ( id, name, logo_url, brand_color, accent_color ),
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!deal) notFound();

  const d = deal as any;
  const myEmail = me.email?.toLowerCase() || '';

  // Pull every participant on this deal.
  const { data: participants } = await service
    .from('deal_participants')
    .select('*')
    .eq('search_id', params.id)
    .order('role');

  const parts = (participants as any[] | null) || [];

  // Determine the caller's relationship to this deal.
  const isStaffSameFirm =
    (me.firm_id === d.firm.id) &&
    ['realtor', 'firm_admin', 'super_admin'].includes(me.role || '');

  // Staff at the originating firm see the canonical editor view by default.
  // They can still preview the client-facing render via /deal/[id]?as=client
  // (used by the "Client view ↗" button on the workspace).
  if (isStaffSameFirm && searchParams?.as !== 'client') {
    redirect('/dashboard/deals/' + params.id);
  }
  const isPrincipalClient = d.client?.id === me.user_id;
  const myParticipantRow = parts.find(
    (p) =>
      p.user_id === me.user_id ||
      (p.external_email && p.external_email.toLowerCase() === myEmail)
  );

  const hasAccess = isStaffSameFirm || isPrincipalClient || !!myParticipantRow;
  if (!hasAccess) notFound();

  // Pretty-print my role for the header banner.
  const myRoleLabel = isStaffSameFirm
    ? 'Realtor'
    : isPrincipalClient
    ? d.kind === 'seller'
      ? 'Seller'
      : 'Buyer'
    : myParticipantRow
    ? (myParticipantRow.role as string).replace(/_/g, ' ')
    : '';

  // Visibility flags. Staff and the principal client see everything; other
  // parties see only what was granted.
  const canSeeFinancials =
    isStaffSameFirm || isPrincipalClient || !!myParticipantRow?.can_view_financials;
  const canSeeDocuments =
    isStaffSameFirm || isPrincipalClient || !!myParticipantRow?.can_view_documents;
  const canSeeMessages =
    isStaffSameFirm || isPrincipalClient || !!myParticipantRow?.can_view_messages;
  const canSeeDates =
    isStaffSameFirm || isPrincipalClient || !!myParticipantRow?.can_view_dates;

  const phaseIdx = PHASES.indexOf(d.phase as any);
  const brand = d.firm?.brand_color || '#0F172A';
  const accent = d.firm?.accent_color || '#2563EB';

  // HOUSE-SCOPED VISIBILITY (the privacy core). When the caller's
  // participant row is scoped to a single house (house_id is set — e.g. the
  // seller's listing agent or the seller themselves), they must see ONLY that
  // one house, never the buyer's other candidates. Staff and the principal
  // client always have house_id NULL here, so they keep seeing everything.
  const scopedHouseId: string | null =
    !isStaffSameFirm && !isPrincipalClient
      ? (myParticipantRow?.house_id as string | null) || null
      : null;

  const housesQuery = service
    .from('houses')
    .select('id, address, list_price, status, photo_url, is_under_contract')
    .eq('search_id', params.id);
  if (scopedHouseId) housesQuery.eq('id', scopedHouseId);

  const [{ data: dates }, { data: documents }, { data: houses }, { data: envelopes }] =
    await Promise.all([
      canSeeDates
        ? service
            .from('important_dates')
            .select('id, label, date, notes, event_time, location, things_to_bring')
            .eq('search_id', params.id)
            .order('date', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      canSeeDocuments
        ? service
            .from('documents')
            .select('id, name, mime_type, created_at, storage_path')
            .eq('search_id', params.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      housesQuery.order('created_at', { ascending: false }),
      // Signing links are visible to every party — it's execution status, not
      // gated by the documents flag.
      service
        .from('esign_envelopes')
        .select('id, envelope_url, status, recipients, document_id, completed_at, created_at')
        .eq('search_id', params.id)
        .order('created_at', { ascending: false }),
    ]);

  // DEAL GROUP CHAT — the shared thread for the whole deal. Only loaded for
  // parties who can see messages (staff, principal client, or a participant
  // with can_view_messages). getDealChat re-runs the same authorization on the
  // server before returning anything. canPost mirrors canSeeMessages — if you
  // can read the group thread, you can post to it.
  let dealChatMessages: DealChatMessage[] = [];
  if (canSeeMessages) {
    const chat = await getDealChat(params.id);
    if (chat.ok) dealChatMessages = chat.messages;
  }

  // Private 1:1 messaging parties (everyone can DM a specific other party).
  const privateRes = canSeeMessages
    ? await getPrivateParties(params.id)
    : { ok: false as const, error: 'no access' };
  const privateParties = privateRes.ok ? privateRes.parties : [];

  // AGREED HOME — surface the chosen house once client + realtor have agreed.
  // Privacy: we only resolve it from the `houses` array the viewer is already
  // allowed to see. For a house-scoped party that array contains at most their
  // one scoped house, so the card only appears if THAT house is the agreed one.
  // For staff / principal client (unscoped) the array contains every house, so
  // the agreed house is always resolvable. We never query outside `houses`.
  const agreedHouse =
    d.house_agreed_at && d.offer_house_id
      ? (houses || []).find((h: any) => h.id === d.offer_house_id) || null
      : null;

  return (
    <main className="min-h-screen" style={{ backgroundColor: brand + '0A' }}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {/* Branded header */}
        <header
          className="overflow-hidden rounded-2xl text-white shadow-soft-lg"
          style={{ backgroundColor: brand }}
        >
          <div className="flex items-center gap-4 px-6 py-6">
            {d.firm?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={d.firm.logo_url}
                alt=""
                className="h-12 w-12 rounded-xl bg-white object-contain p-1.5 shadow-soft-sm"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
                {(d.firm?.name || '?').slice(0, 1)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                {d.firm?.name}
              </div>
              <h1 className="truncate text-2xl font-bold tracking-tight">
                {d.client?.full_name || d.client?.email || 'Deal'}
              </h1>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
              {String(d.phase).replace(/_/g, ' ')}
            </span>
          </div>
          {/* Phase stepper */}
          <div className="border-t border-white/15 px-6 py-5">
            <div className="flex items-center gap-2">
              {PHASES.map((p, i) => {
                const done = phaseIdx >= 0 && i <= phaseIdx;
                const isCurrent = i === phaseIdx;
                return (
                  <div key={p} className="flex flex-1 items-center gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition"
                      style={{
                        backgroundColor: done ? accent : 'rgba(255,255,255,0.2)',
                        color: '#fff',
                        boxShadow: isCurrent
                          ? '0 0 0 4px rgba(255,255,255,0.18)'
                          : undefined,
                      }}
                    >
                      {done && !isCurrent ? (
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    {i < PHASES.length - 1 && (
                      <div
                        className="h-1 flex-1 rounded-full"
                        style={{
                          backgroundColor:
                            done && i < phaseIdx
                              ? accent
                              : 'rgba(255,255,255,0.2)',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px]">
              {PHASES.map((p, i) => (
                <div
                  key={p}
                  className={
                    'flex-1 text-center capitalize ' +
                    (i === phaseIdx ? 'font-semibold opacity-100' : 'opacity-70')
                  }
                >
                  {p.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* Your-role banner */}
        {myRoleLabel && (
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm shadow-soft"
            style={{ borderColor: brand + '33' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Your role
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide capitalize"
                style={{ backgroundColor: brand + '15', color: brand }}
              >
                {myRoleLabel}
              </span>
            </div>
            <span className="text-xs text-ink-500">
              {isStaffSameFirm
                ? "You can edit everything."
                : isPrincipalClient
                ? "You're the principal on this deal."
                : 'Read-only view scoped to what your realtor shared.'}
            </span>
          </div>
        )}

        {/* Agreed home — the house this deal is about. Respects scoping: only
            shown when the viewer is allowed to see the agreed house. */}
        {agreedHouse && (
          <div className="mt-6">
            <AgreedHomeCard
              address={agreedHouse.address}
              photoUrl={agreedHouse.photo_url}
              listPrice={agreedHouse.list_price}
              agreedPrice={canSeeFinancials ? d.agreed_price : null}
              agreedAt={d.house_agreed_at}
              brand={brand}
              accent={accent}
            />
          </div>
        )}

        {/* Closing date highlight */}
        {canSeeDates && d.closing_date && (
          <div
            className="mt-6 flex items-center gap-3 rounded-2xl border bg-white px-5 py-4 shadow-soft"
            style={{ borderColor: brand + '33' }}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: accent + '15', color: accent }}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                Closing date
              </div>
              <div className="text-base font-semibold text-ink-900">
                {formatDateOnly(d.closing_date)}
              </div>
            </div>
          </div>
        )}

        {/* Body grid */}
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <div className="space-y-6 md:col-span-2">
            {/* Houses */}
            <Section title={`Houses (${houses?.length || 0})`}>
              {!houses || houses.length === 0 ? (
                <Empty msg="No houses yet." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {houses.map((h: any) => {
                    const isAgreed = agreedHouse && h.id === agreedHouse.id;
                    return (
                      <li key={h.id} className="flex items-center gap-3 py-2.5">
                        {h.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={h.photo_url}
                            alt=""
                            className="h-12 w-16 rounded-md object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-12 w-16 rounded-md bg-ink-100" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">
                              {h.address}
                            </span>
                            {isAgreed && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                style={{
                                  color: brand,
                                  backgroundColor: brand + '15',
                                }}
                              >
                                Agreed
                              </span>
                            )}
                          </div>
                          {h.list_price && (
                            <div className="text-xs text-ink-500">
                              ${Number(h.list_price).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                          style={{ color: brand, backgroundColor: brand + '15' }}
                        >
                          {String(h.status).replace(/_/g, ' ')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* Financials — gated */}
            {canSeeFinancials && (
              <Section title="Financials">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Row label="Agreed price" value={d.agreed_price} />
                  <Row label="Closing amount" value={d.closing_amount} />
                  <Row label="Earnest money" value={d.earnest_money} />
                  <Row
                    label="Commission"
                    value={
                      d.commission_pct != null
                        ? d.commission_pct + '%'
                        : null
                    }
                    raw
                  />
                </dl>
                {d.contract_url && (
                  <a
                    href={d.contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-sm font-semibold"
                    style={{ color: accent }}
                  >
                    View contract ↗
                  </a>
                )}
              </Section>
            )}

            {/* Important dates — gated */}
            {canSeeDates && (
              <Section title={`Important dates (${dates?.length || 0})`}>
                {!dates || dates.length === 0 ? (
                  <Empty msg="None yet." />
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {dates.map((dd: any) => (
                      <li
                        key={dd.id}
                        className="py-2 text-sm"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-medium">{dd.label}</div>
                          <span className="text-xs text-ink-600 font-semibold">
                            {formatDateOnly(dd.date)}
                            {dd.event_time
                              ? ' · ' +
                                (() => {
                                  const [h, m] = String(dd.event_time).split(':');
                                  const hi = Number(h);
                                  const mi = Number(m || 0);
                                  const am = hi < 12;
                                  const h12 = ((hi + 11) % 12) + 1;
                                  return (
                                    h12 +
                                    ':' +
                                    (mi < 10 ? '0' : '') +
                                    mi +
                                    (am ? ' AM' : ' PM')
                                  );
                                })()
                              : ''}
                          </span>
                        </div>
                        {(dd.location || dd.things_to_bring || dd.notes) && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-ink-500">
                            {dd.location && (
                              <div>{dd.location}</div>
                            )}
                            {dd.things_to_bring && (
                              <div>Bring: {dd.things_to_bring}</div>
                            )}
                            {dd.notes && (
                              <div className="text-ink-400">{dd.notes}</div>
                            )}
                          </div>
                        )}
                        <div className="mt-1">
                          <a
                            href={`/api/calendar/event/${dd.id}`}
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: accent }}
                          >
                            Add to calendar ↗
                          </a>
                        </div>
                        <span className="hidden">
                          {formatDateOnly(dd.date)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {buildCalendarFeedUrl(params.id) && (
                  <a
                    href={buildCalendarFeedUrl(params.id)!.replace(
                      /^https:\/\//,
                      'webcal://'
                    )}
                    className="mt-3 inline-block text-xs font-semibold"
                    style={{ color: accent }}
                  >
                    Subscribe in calendar ↗
                  </a>
                )}
              </Section>
            )}

            {/* Documents — gated */}
            {canSeeDocuments && (
              <Section title={`Documents (${documents?.length || 0})`}>
                {!documents || documents.length === 0 ? (
                  <Empty msg="No documents shared yet." />
                ) : (
                  <AttorneyDocList documents={documents as AttorneyDoc[]} />
                )}
              </Section>
            )}

            {/* Signing links — anything sent for signature on this deal. Every
                party can open the link to sign / review. */}
            {envelopes && envelopes.length > 0 && (
              <Section title={`Signing links (${envelopes.length})`}>
                <ul className="divide-y divide-ink-100">
                  {(envelopes as any[]).map((env) => {
                    const recips = Array.isArray(env.recipients)
                      ? env.recipients
                      : env.recipients?.signers || [];
                    const label =
                      recips.find((r: any) => r?.label)?.label ||
                      (documents || []).find((d: any) => d.id === env.document_id)
                        ?.name ||
                      'Signing link';
                    const signed = env.status === 'completed';
                    return (
                      <li
                        key={env.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
                                (signed
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800')
                              }
                            >
                              {signed ? 'Signed' : 'Awaiting signature'}
                            </span>
                            <span className="truncate text-sm font-medium text-ink-900">
                              {label}
                            </span>
                          </div>
                        </div>
                        {env.envelope_url && !signed && (
                          <a
                            href={env.envelope_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
                          >
                            Open to sign ↗
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {/* Deal group chat — the shared thread for the whole deal. Shown to
                any party who can see messages; they can also post (canPost =
                canSeeMessages). The server action re-authorizes every post. */}
            {canSeeMessages && (
              <DealChat
                searchId={params.id}
                me={{ userId: me.user_id, name: me.full_name }}
                initialMessages={dealChatMessages}
                canPost={canSeeMessages}
              />
            )}

            {/* Private 1:1 messages — DM a specific party; only the two of you
                can see it. Separate from the group chat above. */}
            {canSeeMessages && privateParties.length > 0 && (
              <Section title="Private messages">
                <p className="mb-3 -mt-1 text-xs text-ink-500">
                  A private thread with one party — only the two of you can see
                  it.
                </p>
                <PrivateMessages
                  searchId={params.id}
                  parties={privateParties}
                  accent={brand}
                />
              </Section>
            )}
          </div>

          {/* Sidebar: roster of parties */}
          <aside className="space-y-6">
            <Section title={`On this deal (${parts.length + 2})`}>
              <ul className="space-y-3 text-sm">
                <Party
                  label="Client"
                  name={d.client?.full_name || d.client?.email}
                  email={d.client?.email}
                  badge={d.kind || 'principal'}
                  brand={brand}
                />
                <Party
                  label="Realtor"
                  name={d.realtor?.full_name || d.realtor?.email}
                  email={d.realtor?.email}
                  badge="realtor"
                  brand={brand}
                />
                {parts.map((p: any) => (
                  <Party
                    key={p.id}
                    label={
                      p.role.replace(/_/g, ' ') +
                      (p.represents ? ' · represents ' + p.represents : '')
                    }
                    name={p.external_name || p.external_email}
                    email={p.external_email}
                    phone={p.external_phone}
                    badge={p.role}
                    brand={brand}
                  />
                ))}
              </ul>
              {!canSeeMessages && !isStaffSameFirm && (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
                  You have a read-only view. Some sections are hidden based on
                  what the realtor shared with you.
                </p>
              )}
            </Section>

            {isStaffSameFirm && (
              <Section title="Realtor controls">
                <Link
                  href={`/dashboard/clients/${d.client?.id}`}
                  className="btn-secondary w-full justify-center"
                >
                  Open full dashboard
                </Link>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-soft">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-ink-200 bg-ink-50 px-3.5 py-3 text-sm text-ink-500">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-ink-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v4h1" />
      </svg>
      <span>{msg}</span>
    </div>
  );
}

function Row({ label, value, raw }: { label: string; value: any; raw?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right font-semibold">
        {raw ? value : '$' + Number(value).toLocaleString()}
      </dd>
    </>
  );
}

function Party({
  label,
  name,
  email,
  phone,
  badge,
  brand,
}: {
  label: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  badge: string;
  brand: string;
}) {
  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
          {label}
        </div>
        <div className="truncate font-medium">{name || '—'}</div>
        {email && (
          <a
            href={`mailto:${email}`}
            className="block truncate text-xs text-ink-900 hover:underline"
          >
            {email}
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="block text-xs text-ink-900 hover:underline"
          >
            {phone}
          </a>
        )}
      </div>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
        style={{ backgroundColor: brand + '15', color: brand }}
      >
        {badge.replace(/_/g, ' ')}
      </span>
    </li>
  );
}
