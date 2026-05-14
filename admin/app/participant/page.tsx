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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Sign in to see your deals</h1>
        <Link href="/login" className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Sign in →
        </Link>
      </main>
    );
  }

  const service = getSupabaseServiceRoleClient();
  // Pull every deal_participant row that matches my user_id OR my email.
  const { data: matches } = await service
    .from('deal_participants')
    .select(
      `id, role, can_view_documents, can_view_financials, search_id, created_at,
       search:client_searches (
         id, phase, kind, agreed_price, closing_amount,
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

  // Group by role for cleaner display.
  const grouped = new Map<string, any[]>();
  for (const it of items) {
    const k = it.role;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(it);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Your deals</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every real-estate deal you've been added to. Tap any to see what the
          realtor shared with you.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="font-semibold">No deals yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            When a realtor adds you to a deal using your email
            <span className="ml-1 font-mono">({me.email})</span>, it'll appear
            here automatically. You'll also get an email invitation.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([role, list]) => (
            <section key={role}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                  return (
                    <Link
                      key={p.id}
                      href={`/deal/${s.id}`}
                      className="group block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        {s.firm?.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.firm.logo_url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md object-contain ring-1 ring-slate-200"
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
                          <div className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {s.firm?.name}
                          </div>
                          <div className="truncate text-base font-semibold text-slate-900">
                            {s.client?.full_name || s.client?.email || 'Client'}
                          </div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-2 text-xs text-slate-500">
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
                              <span className="font-semibold text-slate-900">
                                · ${Number(s.agreed_price).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
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
