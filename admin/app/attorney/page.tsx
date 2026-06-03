import Link from 'next/link';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attorney dashboard' };

/**
 * Attorney-specific dashboard. Tailored for closing counsel — every column
 * matters to them (key dates, contract URL, financials, parties). Unlike
 * the generic /participant landing, this one inlines what an attorney
 * actually needs to do their job: scan upcoming closings, jump to the
 * contract, see the parties.
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
  // role='attorney' and external_email matches.
  const lowerEmail = (me.email || '').toLowerCase();
  const [{ data: legacyDeals }, { data: participantRows }] = await Promise.all([
    service
      .from('client_searches')
      .select(
        `id, name, phase, agreed_price, closing_amount, earnest_money,
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
        `id, search_id, can_view_financials, can_view_documents,
         search:client_searches (
           id, name, phase, agreed_price, closing_amount, contract_url,
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
  // (it carries the visibility flags).
  const seen = new Set<string>();
  type Deal = any;
  const deals: Deal[] = [];
  for (const p of (participantRows as any[] | null) || []) {
    if (!p.search) continue;
    seen.add(p.search.id);
    deals.push({ ...p.search, _from: 'participant' });
  }
  for (const d of (legacyDeals as any[] | null) || []) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      deals.push({ ...d, _from: 'legacy' });
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">
            Attorney workspace
          </div>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-ink-900">
            Your closings
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Every deal a realtor has tagged you on. Open one for the contract,
            parties, financials, and key dates.
          </p>
        </div>
        <Link href="/participant" className="btn-secondary text-xs">
          All my deals
        </Link>
      </header>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Active deals" value={deals.length} />
        <StatCard label="Upcoming closings" value={upcoming.length} />
        <StatCard
          label="Awaiting contract"
          value={deals.filter((d) => !d.contract_url).length}
        />
      </div>

      {/* Upcoming closings strip */}
      {upcoming.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
          <div className="border-b border-ink-100 px-5 py-3.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
              Upcoming closings ({upcoming.length})
            </h2>
          </div>
          <ul className="divide-y divide-ink-100">
            {upcoming.slice(0, 5).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <CountdownPill date={d.closing_date} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-900">
                    {d.client?.full_name || d.client?.email || 'Client'}
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {agreedAddressFor(d)
                      ? agreedAddressFor(d)
                      : `${d.firm?.name} · ${String(d.phase).replace(/_/g, ' ')}`}
                  </div>
                </div>
                {d.contract_url ? (
                  <a
                    href={d.contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary px-2.5 py-1 text-[11px]"
                  >
                    Contract ↗
                  </a>
                ) : null}
                <Link
                  href={`/attorney/deals/${d.id}`}
                  className="btn-primary px-2.5 py-1 text-[11px]"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* All deals */}
      <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        <div className="border-b border-ink-100 px-5 py-3.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            All deals ({deals.length})
          </h2>
        </div>
        {deals.length === 0 ? (
          <div className="bg-dotted px-5 py-12 text-center">
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
            <p className="mx-auto mt-3 max-w-sm text-sm text-ink-500">
              No deals tagged to you yet. A realtor will add you using your
              email ({me.email}) — the moment they do, it&apos;ll appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {deals.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/attorney/deals/${d.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-ink-50"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{
                      backgroundColor: d.firm?.brand_color || '#0F172A',
                    }}
                  >
                    {(d.firm?.name || '?').slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink-900">
                      {d.client?.full_name || d.client?.email}
                    </div>
                    <div className="truncate text-xs text-ink-500">
                      {agreedAddressFor(d)
                        ? agreedAddressFor(d)
                        : `${d.firm?.name} · ${
                            d.realtor?.full_name || d.realtor?.email
                          }`}
                    </div>
                  </div>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-700">
                    {String(d.phase).replace(/_/g, ' ')}
                  </span>
                  {d.agreed_price ? (
                    <span className="text-xs font-semibold text-ink-700">
                      ${Number(d.agreed_price).toLocaleString()}
                    </span>
                  ) : null}
                  {d.closing_date ? (
                    <span className="rounded-md bg-ink-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Close {new Date(d.closing_date).toLocaleDateString()}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
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

function CountdownPill({ date }: { date: string }) {
  const days = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const label = days <= 0 ? 'today' : days === 1 ? '1 day' : days + ' days';
  return (
    <div className="flex w-16 shrink-0 flex-col items-center rounded-xl bg-ink-900 px-2 py-1.5 text-white">
      <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">
        Closes
      </span>
      <span className="text-sm font-bold leading-tight">{label}</span>
    </div>
  );
}
