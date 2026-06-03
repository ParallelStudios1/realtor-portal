import Link from 'next/link';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { formatDateOnly, formatDateOnlyLong } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attorney workspace' };

/**
 * Attorney-specific dashboard. Tailored for closing counsel — every column
 * matters to them (phase, next key date, financials, signature status).
 * Unlike the generic /participant landing, this one inlines exactly what an
 * attorney needs to triage their book of deals: scan upcoming closings, see
 * what's awaiting signature, and jump into the legal detail view.
 *
 * Access is UNCHANGED from the original: a deal appears here only if this
 * caller is attached to it as the attorney, EITHER via the legacy
 * `attorney_email` column on client_searches OR a deal_participants row with
 * role='attorney' matching their user_id / external_email. Read-only.
 */
export default async function AttorneyDashboardPage() {
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
            Sign in required
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            You need a Realtor Portal account before you can see deals
            you&apos;re on.
          </p>
          <Link
            href="/login?next=/attorney"
            className="btn-primary mt-6 w-full justify-center"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const service = getSupabaseServiceRoleClient();
  // Pull every deal where this attorney is named, EITHER via the legacy
  // attorney_email column on client_searches OR via deal_participants where
  // role='attorney' and external_email / user_id matches. (Access UNCHANGED.)
  const lowerEmail = (me.email || '').toLowerCase();
  const [{ data: legacyDeals }, { data: participantRows }] = await Promise.all([
    service
      .from('client_searches')
      .select(
        `id, name, phase, kind, agreed_price, closing_amount, earnest_money,
         contract_url, docusign_envelope_url, attorney_name, attorney_phone,
         closing_date, updated_at, offer_house_id, house_agreed_at,
         firm:firms ( id, name, logo_url, brand_color ),
         client:users!client_searches_client_id_fkey ( id, full_name, email ),
         realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
      )
      .ilike('attorney_email', lowerEmail),
    service
      .from('deal_participants')
      .select(
        `id, search_id, represents, can_view_financials, can_view_documents,
         search:client_searches (
           id, name, phase, kind, agreed_price, closing_amount, contract_url,
           docusign_envelope_url, closing_date, updated_at,
           offer_house_id, house_agreed_at,
           firm:firms ( id, name, logo_url, brand_color ),
           client:users!client_searches_client_id_fkey ( id, full_name, email ),
           realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )
         )`
      )
      .eq('role', 'attorney')
      .or(`user_id.eq.${me.user_id},external_email.ilike.${lowerEmail}`),
  ]);

  // Build deduped union, preferring the participant row when both exist
  // (it carries the visibility flags + represents).
  const seen = new Set<string>();
  type Deal = any;
  const deals: Deal[] = [];
  for (const p of (participantRows as any[] | null) || []) {
    if (!p.search) continue;
    seen.add(p.search.id);
    deals.push({ ...p.search, _represents: p.represents, _from: 'participant' });
  }
  for (const d of (legacyDeals as any[] | null) || []) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      deals.push({ ...d, _from: 'legacy' });
    }
  }

  const dealIds = deals.map((d) => d.id);

  // The next key date for each deal: the soonest upcoming important_date.
  // (Closing is surfaced separately via closing_date.) And whether anything
  // is awaiting signature: any esign envelope not yet completed/declined/voided.
  const nextDateByDeal = new Map<string, { label: string; date: string }>();
  const pendingSigByDeal = new Set<string>();
  if (dealIds.length > 0) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [{ data: upcomingDates }, { data: envelopes }] = await Promise.all([
      service
        .from('important_dates')
        .select('search_id, label, date')
        .in('search_id', dealIds)
        .gte('date', todayStr)
        .order('date', { ascending: true }),
      service
        .from('esign_envelopes')
        .select('search_id, status')
        .in('search_id', dealIds),
    ]);
    for (const row of (upcomingDates as any[] | null) || []) {
      // First (soonest) per deal wins, since the query is date-ascending.
      if (!nextDateByDeal.has(row.search_id)) {
        nextDateByDeal.set(row.search_id, {
          label: row.label,
          date: row.date,
        });
      }
    }
    const OPEN_SIG = new Set(['created', 'sent', 'delivered']);
    for (const env of (envelopes as any[] | null) || []) {
      if (OPEN_SIG.has(String(env.status))) pendingSigByDeal.add(env.search_id);
    }
  }

  // Sort: deals with a closing_date in the future come first, soonest first;
  // then everything else by updated_at desc.
  const now = Date.now();
  deals.sort((a, b) => {
    const aDate = a.closing_date ? new Date(a.closing_date).getTime() : null;
    const bDate = b.closing_date ? new Date(b.closing_date).getTime() : null;
    const aFuture = aDate != null && aDate >= now;
    const bFuture = bDate != null && bDate >= now;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    if (aFuture && bFuture) return (aDate as number) - (bDate as number);
    return (
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  });

  const upcoming = deals.filter(
    (d) => d.closing_date && new Date(d.closing_date).getTime() >= now
  );
  const awaitingSignature = deals.filter((d) => pendingSigByDeal.has(d.id));

  // Resolve the agreed-home address for each deal that has one, in a single
  // batched lookup. Read-only context for the attorney's scan.
  const agreedHouseIds = Array.from(
    new Set(
      deals
        .filter((d) => d.house_agreed_at && d.offer_house_id)
        .map((d) => d.offer_house_id as string)
    )
  );
  const houseAddressById = new Map<string, string>();
  if (agreedHouseIds.length > 0) {
    const { data: agreedHouses } = await service
      .from('houses')
      .select('id, address')
      .in('id', agreedHouseIds);
    for (const h of (agreedHouses as any[] | null) || []) {
      if (h.address) houseAddressById.set(h.id, h.address);
    }
  }
  const agreedAddressFor = (d: any): string | null =>
    d.house_agreed_at && d.offer_house_id
      ? houseAddressById.get(d.offer_house_id) || null
      : null;

  // Buyer-vs-seller representation. Prefer the participant `represents` when we
  // have it; otherwise infer from the deal kind (seller/listing => seller side).
  const sideFor = (d: any): 'buyer' | 'seller' => {
    const rep = (d._represents || '').toLowerCase();
    if (rep.includes('seller')) return 'seller';
    if (rep.includes('buyer')) return 'buyer';
    const kind = (d.kind || '').toLowerCase();
    if (kind === 'seller' || kind === 'listing') return 'seller';
    return 'buyer';
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
          Attorney workspace
        </div>
        <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-ink-900">
          Your closings
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Every deal you&apos;re counsel on. Open one for the contract,
          financials, deadlines, parties, and signature status — all read-only.
        </p>
      </header>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Active deals" value={deals.length} />
        <StatCard label="Upcoming closings" value={upcoming.length} />
        <StatCard label="Awaiting signature" value={awaitingSignature.length} />
      </div>

      {/* All deals */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className="border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            All deals ({deals.length})
          </h2>
        </div>
        {deals.length === 0 ? (
          <div className="bg-dotted px-5 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink-100">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-6 w-6 text-ink-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink-900">
              No deals yet
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
              When a realtor adds you as counsel using your email
              ({me.email}), the deal will appear here with its contract,
              deadlines, and parties.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {deals.map((d) => {
              const side = sideFor(d);
              const nextDate = nextDateByDeal.get(d.id) || null;
              const needsSig = pendingSigByDeal.has(d.id);
              const address = agreedAddressFor(d);
              return (
                <li key={d.id}>
                  <Link
                    href={`/attorney/deals/${d.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 transition hover:bg-ink-50"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{
                        backgroundColor: d.firm?.brand_color || '#0F172A',
                      }}
                    >
                      {(d.firm?.name || '?').slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink-900">
                          {d.client?.full_name || d.client?.email || 'Client'}
                        </span>
                        <SideBadge side={side} />
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-500">
                        {address ? (
                          <span>{address}</span>
                        ) : (
                          <span>{d.firm?.name}</span>
                        )}
                        {' · '}
                        {d.firm?.name && address ? `${d.firm.name} · ` : ''}
                        {d.realtor?.full_name || d.realtor?.email || 'Realtor'}
                      </div>
                    </div>

                    {/* Phase chip */}
                    <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-700">
                      {String(d.phase).replace(/_/g, ' ')}
                    </span>

                    {/* Needs-signature flag */}
                    {needsSig && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 rounded-full bg-amber-500"
                        />
                        Signature
                      </span>
                    )}

                    {/* Next key date: closing wins, else soonest deadline */}
                    <NextDate
                      closingDate={d.closing_date}
                      nextDate={nextDate}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5 shadow-soft">
      <div className="text-2xl font-bold tracking-tight text-ink-900">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </div>
    </div>
  );
}

function SideBadge({ side }: { side: 'buyer' | 'seller' }) {
  return (
    <span className="shrink-0 rounded-md border border-ink-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ink-500">
      {side}
    </span>
  );
}

function NextDate({
  closingDate,
  nextDate,
}: {
  closingDate: string | null;
  nextDate: { label: string; date: string } | null;
}) {
  // Prefer the closing date when it's in the future; otherwise show the
  // soonest upcoming important date so the attorney sees the next obligation.
  const now = Date.now();
  const closingFuture =
    closingDate && new Date(closingDate).getTime() >= now;

  if (closingFuture) {
    return (
      <div className="shrink-0 text-right">
        <div className="text-[9px] font-bold uppercase tracking-wider text-ink-400">
          Closing
        </div>
        <div className="text-xs font-semibold text-ink-900">
          {formatDateOnly(closingDate)}
        </div>
      </div>
    );
  }
  if (nextDate) {
    return (
      <div className="shrink-0 text-right">
        <div className="max-w-[7rem] truncate text-[9px] font-bold uppercase tracking-wider text-ink-400">
          {nextDate.label}
        </div>
        <div className="text-xs font-semibold text-ink-900">
          {formatDateOnlyLong(nextDate.date)}
        </div>
      </div>
    );
  }
  if (closingDate) {
    return (
      <div className="shrink-0 text-right">
        <div className="text-[9px] font-bold uppercase tracking-wider text-ink-400">
          Closed
        </div>
        <div className="text-xs font-semibold text-ink-500">
          {formatDateOnly(closingDate)}
        </div>
      </div>
    );
  }
  return null;
}
