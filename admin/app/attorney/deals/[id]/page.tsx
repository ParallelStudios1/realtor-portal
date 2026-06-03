import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { formatDateOnly } from '@/lib/dates';
import { AgreedHomeCard } from '@/components/AgreedHomeCard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Deal' };

const PHASES = [
  'searching',
  'offer_made',
  'under_contract',
  'closing',
  'closed',
] as const;

/**
 * Read-only attorney deal view. Tailored for closing counsel: agreed home,
 * phase, key dates, contract/documents, financials, and the roster of parties.
 *
 * Access mirrors /deal/[id]: the caller must be attached to this deal as the
 * attorney — either via the legacy `attorney_email` column OR a
 * deal_participants row with role='attorney'. Visibility flags from the
 * participant row are honored exactly. Nothing here mutates state.
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

  const [{ data: dates }, { data: documents }, { data: houses }] =
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
            .select('id, name, mime_type, created_at')
            .eq('search_id', params.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      housesQuery.order('created_at', { ascending: false }),
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
            </span>
          </div>
          <span className="text-xs text-ink-500">
            Read-only closing view.
          </span>
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

        {/* Closing date highlight */}
        {d.closing_date && (
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

        <div className="mt-6 space-y-6">
          {/* Contract + financials */}
          {canSeeFinancials && (
            <Section title="Financials & contract">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row label="Agreed price" value={d.agreed_price} />
                <Row label="Closing amount" value={d.closing_amount} />
                <Row label="Earnest money" value={d.earnest_money} />
                <Row
                  label="Commission"
                  value={
                    d.commission_pct != null ? d.commission_pct + '%' : null
                  }
                  raw
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

          {/* Key dates */}
          {canSeeDates && (
            <Section title={`Key dates (${dates?.length || 0})`}>
              {!dates || dates.length === 0 ? (
                <Empty msg="No dates yet." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {dates.map((dd: any) => (
                    <li key={dd.id} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-medium">{dd.label}</div>
                        <span className="text-xs font-semibold text-ink-600">
                          {formatDateOnly(dd.date)}
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
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* Documents */}
          {canSeeDocuments && (
            <Section title={`Documents (${documents?.length || 0})`}>
              {!documents || documents.length === 0 ? (
                <Empty msg="No documents shared yet." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {documents.map((doc: any) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-2 py-2 text-sm"
                    >
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
                        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium">{doc.name}</div>
                        <div className="text-xs text-ink-500">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

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

          {/* Parties */}
          <Section title="Parties on this deal">
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
