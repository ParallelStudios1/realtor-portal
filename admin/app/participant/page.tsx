import Link from 'next/link';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your deals' };

const ROLE_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  realtor: 'Realtor',
  co_realtor: 'Co-realtor',
  attorney: 'Attorney',
  inspector: 'Inspector',
  lender: 'Lender',
  appraiser: 'Appraiser',
  title_agent: 'Title agent',
  mortgage_broker: 'Mortgage broker',
  other: 'Other',
};

const ROLE_COLOR: Record<string, string> = {
  buyer: '#2563EB',
  seller: '#0EA5E9',
  realtor: '#0F172A',
  co_realtor: '#475569',
  attorney: '#7C3AED',
  inspector: '#EA580C',
  lender: '#059669',
  appraiser: '#D97706',
  title_agent: '#DC2626',
  mortgage_broker: '#16A34A',
  other: '#64748B',
};

/**
 * Universal landing for anyone on `deal_participants`. Replaces the per-role
 * dedicated dashboards. Shows every deal they've been added to, grouped by
 * the role they hold on each deal, with a one-line summary card.
 *
 * This is the home for inspectors / lenders / mortgage brokers / title
 * agents / appraisers / etc. — anyone who isn't the principal client and
 * isn't staff at the originating firm.
 */
export default async function ParticipantHome() {
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
            Sign in to see your deals
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Use the email a realtor added you with.
          </p>
          <Link href="/login" className="btn-primary mt-6 w-full justify-center">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const service = getSupabaseServiceRoleClient();
  // Pull every deal_participant row that matches my user_id OR my email.
  const { data: matches } = await service
    .from('deal_participants')
    .select(
      `id, role, represents, house_id, can_view_documents, can_view_financials, search_id, created_at,
       search:client_searches (
         id, phase, kind, agreed_price, closing_amount, offer_house_id,
         firm:firms ( name, logo_url, brand_color ),
         client:users!client_searches_client_id_fkey ( full_name, email ),
         realtor:users!client_searches_realtor_id_fkey ( full_name, email )
       )`
    )
    .or(
      `user_id.eq.${me.user_id},external_email.ilike.${me.email}`
    )
    .order('created_at', { ascending: false });

  const items = ((matches as any[]) || []).filter((m) => m.search);

  // Resolve the property each party is tied to — their house_id if scoped to
  // one, else the deal's agreed home. Sellers see "the house they're selling".
  const houseIds = Array.from(
    new Set(
      items
        .map((m) => m.house_id || m.search?.offer_house_id)
        .filter((x): x is string => !!x)
    )
  );
  const houseById = new Map<string, { address: string; photo_url: string | null }>();
  if (houseIds.length > 0) {
    const { data: hs } = await service
      .from('houses')
      .select('id, address, photo_url')
      .in('id', houseIds);
    for (const h of (hs as any[]) || [])
      houseById.set(h.id, { address: h.address, photo_url: h.photo_url });
  }

  // Group by role for cleaner display.
  const grouped = new Map<string, any[]>();
  for (const it of items) {
    const k = it.role;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(it);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
            Your access
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Your deals</h1>
          <p className="mt-1 text-sm text-ink-600">
            Every real-estate deal you&apos;ve been added to. Tap any to see what
            the realtor shared with you.
          </p>
        </div>
        <span className="hidden rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-soft-xs sm:inline">
          {items.length} {items.length === 1 ? 'deal' : 'deals'}
        </span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center shadow-soft-sm">
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
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold">No deals yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-600">
            When a realtor adds you to a deal using your email{' '}
            <span className="font-mono text-ink-800">({me.email})</span>{' '}
            it&apos;ll appear here automatically. You&apos;ll also get an email
            invitation.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([role, list]) => (
            <section key={role}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: ROLE_COLOR[role] || '#64748B' }}
                />
                {ROLE_LABEL[role] || role} ({list.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((p: any) => {
                  const s = p.search;
                  const brand = s.firm?.brand_color || '#0F172A';
                  const house =
                    houseById.get(p.house_id) ||
                    houseById.get(s.offer_house_id) ||
                    null;
                  const houseLabel =
                    p.role === 'seller'
                      ? 'Your listing'
                      : p.role === 'buyer'
                        ? 'The home'
                        : 'Property';
                  return (
                    <Link
                      key={p.id}
                      href={`/deal/${s.id}`}
                      className="card-interactive group block p-4"
                    >
                      <div className="flex items-start gap-3">
                        {s.firm?.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.firm.logo_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md object-contain ring-1 ring-ink-200"
                          />
                        ) : (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                            style={{ backgroundColor: brand }}
                          >
                            {(s.firm?.name || '?').slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold uppercase tracking-wide text-ink-500">
                            {s.firm?.name}
                          </div>
                          <div className="truncate text-base font-semibold text-ink-900">
                            {s.client?.full_name || s.client?.email || 'Client'}
                          </div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs text-ink-500">
                            <span
                              className="rounded-full px-2 py-0.5 font-semibold uppercase"
                              style={{
                                backgroundColor: brand + '15',
                                color: brand,
                              }}
                            >
                              {String(s.phase).replace(/_/g, ' ')}
                            </span>
                            {s.kind && <span>· {s.kind}</span>}
                            {p.can_view_financials && s.agreed_price && (
                              <span className="font-semibold text-ink-900">
                                · ${Number(s.agreed_price).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {house && (
                        <div className="mt-3 flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-50/70 p-2.5">
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-200">
                            {house.photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={house.photo_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-ink-400">
                                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                              {houseLabel}
                            </div>
                            <div className="truncate text-sm font-semibold text-ink-900">
                              {house.address}
                            </div>
                          </div>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
