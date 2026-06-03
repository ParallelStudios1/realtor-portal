import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { formatDateOnly, formatDateOnlyLong } from '@/lib/dates';
import { AgreedHomeCard } from '@/components/AgreedHomeCard';
import { AttorneyDocList, type AttorneyDoc } from '@/components/AttorneyDocList';
import { LocalDateTime } from '@/components/LocalDateTime';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Deal' };

const PHASES = [
  'searching',
  'offer_made',
  'under_contract',
  'closing',
  'closed',
] as const;

// Open e-sign states (not yet finished) — these are what an attorney must chase.
const OPEN_SIG = new Set(['created', 'sent', 'delivered']);

// Labels that signal a legally significant deadline. Used to highlight the
// rows an attorney actually tracks (closing, due diligence, contingencies,
// earnest money). Matched case-insensitively against important_dates.label.
const LEGAL_DATE_HINTS = [
  'closing',
  'close',
  'due diligence',
  'diligence',
  'contingency',
  'contingencies',
  'earnest',
  'inspection',
  'financing',
  'appraisal',
  'title',
  'possession',
];

function isLegalDate(label: string): boolean {
  const l = (label || '').toLowerCase();
  return LEGAL_DATE_HINTS.some((h) => l.includes(h));
}

/**
 * Read-only attorney deal view. Tailored for closing counsel and organized
 * around what an attorney does on a deal: triage what needs attention, review
 * deadlines, verify the closing figures, open the contract & documents, track
 * e-signatures, and reach every party.
 *
 * Access mirrors /deal/[id] and is UNCHANGED: the caller must be attached to
 * this deal as the attorney — either via the legacy `attorney_email` column OR
 * a deal_participants row with role='attorney'. Per-participant visibility
 * flags (financials / documents / dates) and house scoping are honored exactly.
 * Nothing here mutates state — every action is a link or a read-only signed-URL
 * fetch.
 */
export default async function AttorneyDealPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getMe();
  if (!me?.user_id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-50 px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-soft-lg">
          <h1 className="text-xl font-bold tracking-tight">
            Sign in to view this deal
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            This deal is private. Sign in with the email it was shared with.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(
              '/attorney/deals/' + params.id
            )}`}
            className="btn-primary mt-6 w-full justify-center"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const service = getSupabaseServiceRoleClient();
  const myEmail = me.email?.toLowerCase() || '';

  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, name, phase, kind, agreed_price, closing_amount, earnest_money,
       commission_pct, contract_url, docusign_envelope_url,
       attorney_email, attorney_name, attorney_phone, notes, created_at,
       closing_date, offer_house_id, house_agreed_at,
       firm:firms ( id, name, logo_url, brand_color, accent_color ),
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', params.id)
    .maybeSingle();
  if (!deal) notFound();
  const d = deal as any;

  // Pull this caller's attorney participant row (if any) for visibility flags
  // and house scoping. Same access model as /deal/[id].
  const { data: participants } = await service
    .from('deal_participants')
    .select('*')
    .eq('search_id', params.id)
    .order('role');
  const parts = (participants as any[] | null) || [];

  const myAttorneyRow = parts.find(
    (p) =>
      p.role === 'attorney' &&
      (p.user_id === me.user_id ||
        (p.external_email && p.external_email.toLowerCase() === myEmail))
  );
  const isLegacyAttorney =
    !!d.attorney_email && d.attorney_email.toLowerCase() === myEmail;

  // ACCESS: must be attached to this deal as the attorney. Otherwise 404.
  if (!myAttorneyRow && !isLegacyAttorney) notFound();

  // Visibility flags. Legacy attorneys (no participant row) see the full
  // closing context; participant attorneys see exactly what was granted.
  const canSeeFinancials =
    isLegacyAttorney || !!myAttorneyRow?.can_view_financials;
  const canSeeDocuments =
    isLegacyAttorney || !!myAttorneyRow?.can_view_documents;
  const canSeeDates = isLegacyAttorney || !!myAttorneyRow?.can_view_dates;

  // HOUSE-SCOPED VISIBILITY. If the attorney's participant row is scoped to a
  // single house, they may see ONLY that one house. Legacy attorneys are
  // unscoped and see every house on the deal.
  const scopedHouseId: string | null =
    (myAttorneyRow?.house_id as string | null) || null;

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
            .select('id, label, date, notes, event_time, location')
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
      // E-signature is legal status the attorney always needs to see (it's not
      // gated by the financials/documents flags — it's the state of execution).
      service
        .from('esign_envelopes')
        .select(
          'id, envelope_id, envelope_url, status, recipients, completed_at, created_at'
        )
        .eq('search_id', params.id)
        .order('created_at', { ascending: false }),
    ]);

  // AGREED HOME — resolved only from houses the viewer is allowed to see.
  const agreedHouse =
    d.house_agreed_at && d.offer_house_id
      ? (houses || []).find((h: any) => h.id === d.offer_house_id) || null
      : null;

  const phaseIdx = PHASES.indexOf(d.phase as any);
  const brand = d.firm?.brand_color || '#0F172A';
  const accent = d.firm?.accent_color || '#2563EB';

  // Other parties (excluding this attorney) for the roster.
  const otherParts = parts.filter((p) => p.id !== myAttorneyRow?.id);

  // ---- NEEDS YOUR ATTENTION -------------------------------------------------
  const openEnvelopes = (envelopes as any[] | null || []).filter((e) =>
    OPEN_SIG.has(String(e.status))
  );

  // Upcoming legal deadlines within ~14 days (closing + important_dates).
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10);
  const horizonStr = horizon.toISOString().slice(0, 10);

  type Deadline = { label: string; date: string; time?: string | null; legal: boolean };
  const upcomingDeadlines: Deadline[] = [];
  if (
    d.closing_date &&
    d.closing_date >= todayStr &&
    d.closing_date <= horizonStr
  ) {
    upcomingDeadlines.push({ label: 'Closing', date: d.closing_date, legal: true });
  }
  for (const dd of (dates as any[] | null) || []) {
    if (dd.date >= todayStr && dd.date <= horizonStr) {
      upcomingDeadlines.push({
        label: dd.label,
        date: dd.date,
        time: dd.event_time,
        legal: isLegalDate(dd.label),
      });
    }
  }
  upcomingDeadlines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const hasAttention = openEnvelopes.length > 0 || upcomingDeadlines.length > 0;

  return (
    <main className="min-h-screen" style={{ backgroundColor: brand + '0A' }}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/attorney"
          className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900"
        >
          ← Your closings
        </Link>

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

        {/* Role banner */}
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-white px-4 py-3 text-sm shadow-soft"
          style={{ borderColor: brand + '33' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
              Your role
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide"
              style={{ backgroundColor: brand + '15', color: brand }}
            >
              Attorney
              {myAttorneyRow?.represents
                ? ` · ${myAttorneyRow.represents}`
                : ''}
            </span>
          </div>
          <span className="text-xs text-ink-500">Read-only closing view.</span>
        </div>

        {/* Agreed home */}
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

        <div className="mt-6 space-y-6">
          {/* ============== NEEDS YOUR ATTENTION ============== */}
          {hasAttention && (
            <section
              className="overflow-hidden rounded-2xl border bg-white shadow-soft"
              style={{ borderColor: accent + '40' }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3"
                style={{ backgroundColor: accent + '12' }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  style={{ color: accent }}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                </svg>
                <h2
                  className="text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: accent }}
                >
                  Needs your attention
                </h2>
              </div>
              <div className="space-y-4 px-5 py-4">
                {/* Pending signatures */}
                {openEnvelopes.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Awaiting signature
                    </div>
                    <ul className="mt-2 space-y-2">
                      {openEnvelopes.map((env) => {
                        const recips = recipientsOf(env.recipients);
                        return (
                          <li
                            key={env.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <EsignStatusBadge status={env.status} />
                                <span className="truncate text-sm font-semibold text-ink-900">
                                  Envelope {String(env.envelope_id).slice(0, 8)}…
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-ink-500">
                                {recips.length > 0
                                  ? `${recips.length} recipient${
                                      recips.length === 1 ? '' : 's'
                                    }`
                                  : 'Out for signature'}
                              </div>
                            </div>
                            {env.envelope_url && (
                              <a
                                href={env.envelope_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                              >
                                Open in DocuSign ↗
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Upcoming legal deadlines (≤14 days) */}
                {upcomingDeadlines.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                      Deadlines within 14 days
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {upcomingDeadlines.map((dl, i) => (
                        <li
                          key={`${dl.label}-${dl.date}-${i}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <CountdownChip date={dl.date} accent={accent} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-ink-900">
                                  {dl.label}
                                </span>
                                {dl.legal && (
                                  <span
                                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                    style={{
                                      color: accent,
                                      backgroundColor: accent + '14',
                                    }}
                                  >
                                    Legal
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-ink-500">
                                {formatDateOnlyLong(dl.date)}
                                {dl.time ? ` · ${dl.time}` : ''}
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ============== KEY DATES / DEADLINES ============== */}
          {canSeeDates && (
            <Section title={`Key dates & deadlines (${dates?.length || 0})`}>
              {!dates || dates.length === 0 ? (
                <Empty msg="No dates on this deal yet." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {dates.map((dd: any) => {
                    const legal = isLegalDate(dd.label);
                    return (
                      <li key={dd.id} className="py-2.5 text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-ink-900">
                              {dd.label}
                            </span>
                            {legal && (
                              <span
                                className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                style={{
                                  color: accent,
                                  backgroundColor: accent + '14',
                                }}
                              >
                                Legal
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-ink-700">
                            {formatDateOnlyLong(dd.date)}
                            {dd.event_time ? ` · ${dd.event_time}` : ''}
                          </span>
                        </div>
                        {(dd.location || dd.notes) && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-ink-500">
                            {dd.location && <div>{dd.location}</div>}
                            {dd.notes && (
                              <div className="text-ink-400">{dd.notes}</div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          {/* ============== CLOSING & FINANCIALS ============== */}
          {canSeeFinancials && (
            <Section title="Closing & financials">
              {d.closing_date && (
                <div
                  className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
                  style={{ borderColor: accent + '33', backgroundColor: accent + '0A' }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: accent + '18', color: accent }}
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
                      {formatDateOnlyLong(d.closing_date)}
                    </div>
                  </div>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Money label="Agreed price" value={d.agreed_price} />
                <Money label="Earnest money" value={d.earnest_money} />
                <Money label="Closing amount" value={d.closing_amount} />
                <Field
                  label="Commission"
                  value={
                    d.commission_pct != null ? d.commission_pct + '%' : null
                  }
                />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {d.contract_url && (
                  <a
                    href={d.contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-xs"
                  >
                    View contract ↗
                  </a>
                )}
                {d.docusign_envelope_url && (
                  <a
                    href={d.docusign_envelope_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-xs"
                  >
                    DocuSign envelope ↗
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* ============== CONTRACT & DOCUMENTS ============== */}
          <Section title="Contract & documents">
            {/* Contract links — always shown if present (the executed/working
                contract is core to the attorney's review). */}
            {(d.contract_url || d.docusign_envelope_url) && (
              <div className="mb-3 flex flex-wrap gap-2 border-b border-ink-100 pb-3">
                {d.contract_url && (
                  <a
                    href={d.contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 shadow-soft-sm transition hover:bg-ink-50"
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-ink-400"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                    </svg>
                    Purchase contract ↗
                  </a>
                )}
                {d.docusign_envelope_url && (
                  <a
                    href={d.docusign_envelope_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-900 shadow-soft-sm transition hover:bg-ink-50"
                  >
                    DocuSign envelope ↗
                  </a>
                )}
              </div>
            )}

            {!canSeeDocuments ? (
              <Empty msg="Document access hasn't been shared with you on this deal." />
            ) : !documents || documents.length === 0 ? (
              <Empty msg="No documents shared yet." />
            ) : (
              <AttorneyDocList documents={documents as AttorneyDoc[]} />
            )}
          </Section>

          {/* ============== E-SIGNATURE STATUS ============== */}
          <Section title={`E-signature status (${envelopes?.length || 0})`}>
            {!envelopes || envelopes.length === 0 ? (
              <Empty msg="No envelopes have been sent for signature yet." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {(envelopes as any[]).map((env) => {
                  const recips = recipientsOf(env.recipients);
                  const signed = recips.filter((r) =>
                    ['completed', 'signed'].includes(
                      String(r.status || '').toLowerCase()
                    )
                  ).length;
                  return (
                    <li key={env.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <EsignStatusBadge status={env.status} />
                          <span className="text-sm font-semibold text-ink-900">
                            Envelope {String(env.envelope_id).slice(0, 8)}…
                          </span>
                        </div>
                        {env.envelope_url && (
                          <a
                            href={env.envelope_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary px-2.5 py-1 text-[11px]"
                          >
                            Open ↗
                          </a>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-ink-500">
                        Sent{' '}
                        <LocalDateTime
                          value={env.created_at}
                          dateOptions={{
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }}
                          placeholder="—"
                        />
                        {recips.length > 0 && (
                          <> · {signed}/{recips.length} signed</>
                        )}
                        {env.completed_at && (
                          <>
                            {' · '}Completed{' '}
                            <LocalDateTime
                              value={env.completed_at}
                              dateOptions={{
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              }}
                              placeholder="—"
                            />
                          </>
                        )}
                      </div>
                      {recips.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {recips.map((r, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-2 text-[11px]"
                            >
                              <span className="truncate text-ink-700">
                                {r.name || r.email || `Recipient ${i + 1}`}
                              </span>
                              <RecipientStatus status={r.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* ============== PARTIES & CONTACTS ============== */}
          <Section title="Parties & contacts">
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
              {otherParts.map((p: any) => (
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
          </Section>
        </div>
      </div>
    </main>
  );
}

/** Normalize the esign_envelopes.recipients JSON to a flat array. */
function recipientsOf(recipients: any): any[] {
  if (Array.isArray(recipients)) return recipients;
  if (recipients?.signers && Array.isArray(recipients.signers))
    return recipients.signers;
  return [];
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

function Money({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-bold tracking-tight text-ink-900">
        {value == null || value === ''
          ? '—'
          : '$' + Number(value).toLocaleString()}
      </dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-bold tracking-tight text-ink-900">
        {value == null || value === '' ? '—' : value}
      </dd>
    </div>
  );
}

const ESIGN_STATUS_STYLE: Record<string, string> = {
  created: 'bg-ink-100 text-ink-700',
  sent: 'bg-amber-100 text-amber-800',
  delivered: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
  voided: 'bg-ink-200 text-ink-600',
};

function EsignStatusBadge({ status }: { status: string }) {
  const cls = ESIGN_STATUS_STYLE[status] || 'bg-ink-100 text-ink-700';
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
        cls
      }
    >
      {String(status).replace(/_/g, ' ')}
    </span>
  );
}

function RecipientStatus({ status }: { status: any }) {
  const s = String(status || 'pending').toLowerCase();
  const done = ['completed', 'signed'].includes(s);
  const declined = ['declined'].includes(s);
  return (
    <span
      className={
        'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ' +
        (done
          ? 'bg-emerald-100 text-emerald-800'
          : declined
            ? 'bg-rose-100 text-rose-800'
            : 'bg-amber-100 text-amber-800')
      }
    >
      {done ? 'Signed' : declined ? 'Declined' : 'Pending'}
    </span>
  );
}

function CountdownChip({ date, accent }: { date: string; accent: string }) {
  // DATE-ONLY countdown from the literal calendar day — timezone-stable to
  // avoid hydration drift (mirrors lib/dates behavior).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date));
  let days = 0;
  if (m) {
    const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    const todayUtc = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate()
    );
    days = Math.round((target - todayUtc) / (1000 * 60 * 60 * 24));
  }
  const label = days <= 0 ? 'Today' : days === 1 ? '1d' : `${days}d`;
  return (
    <div
      className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center"
      style={{ backgroundColor: accent + '15', color: accent }}
    >
      <span className="text-sm font-bold leading-none">{label}</span>
    </div>
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
        <div className="truncate font-medium text-ink-900">{name || '—'}</div>
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
