import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { DealsBoard } from './DealsBoard';

export const dynamic = 'force-dynamic';

/**
 * Top-level Deals workspace. Replaces the old per-client drill-down as the
 * primary surface for realtors — everyone wants to see "what deals are
 * happening" not "what clients exist". Cards show phase, last activity,
 * principal, and clicking opens the canonical deal view.
 */
export default async function DealsListPage({
  searchParams,
}: {
  searchParams?: { phase?: string; q?: string; view?: string };
}) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  const phaseFilter = (searchParams?.phase || '').trim();
  const query = (searchParams?.q || '').trim().toLowerCase();
  const view = searchParams?.view === 'board' ? 'board' : 'list';

  let qb = supabase
    .from('client_searches')
    .select(
      `id, name, kind, phase, updated_at, created_at, agreed_price,
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('firm_id', me.firm_id!)
    .order('updated_at', { ascending: false });

  if (phaseFilter && phaseFilter !== 'all') {
    qb = qb.eq('phase', phaseFilter);
  }

  const { data: rawDeals } = await qb;

  // GUEST DEALS — cross-firm deals where I'm a participant but the deal is
  // hosted by a DIFFERENT firm. The main query above only returns own-firm
  // deals (firm_id = me.firm_id), so a realtor added to another firm's deal
  // never sees it in their own Deals list without this. We run the lookup
  // with the service-role client because RLS on client_searches wouldn't
  // surface another firm's rows to a plain SSR query, and the participant
  // membership check below is our authorization gate.
  const guestDeals: any[] = [];
  try {
    const service = getSupabaseServiceRoleClient();
    const orClauses = [
      'user_id.eq.' + me.user_id,
      me.email ? 'external_email.ilike.' + me.email : null,
    ]
      .filter(Boolean)
      .join(',');
    const { data: myParts } = await service
      .from('deal_participants')
      .select('search_id')
      .or(orClauses);
    const searchIds = Array.from(
      new Set(((myParts || []) as any[]).map((p) => p.search_id).filter(Boolean))
    );
    if (searchIds.length > 0) {
      let gqb = service
        .from('client_searches')
        .select(
          `id, name, kind, phase, updated_at, created_at, agreed_price, firm_id,
           client:users!client_searches_client_id_fkey ( id, full_name, email ),
           realtor:users!client_searches_realtor_id_fkey ( id, full_name, email ),
           host:firms!client_searches_firm_id_fkey ( name )`
        )
        .in('id', searchIds)
        .neq('firm_id', me.firm_id!)
        .order('updated_at', { ascending: false });
      if (phaseFilter && phaseFilter !== 'all') {
        gqb = gqb.eq('phase', phaseFilter);
      }
      const { data: rawGuests } = await gqb;
      const ownIds = new Set(((rawDeals || []) as any[]).map((d) => d.id));
      for (const g of (rawGuests || []) as any[]) {
        if (ownIds.has(g.id)) continue; // dedupe — own-firm deals already covered
        guestDeals.push({
          ...g,
          _guest: true,
          _hostFirm: (g.host as any)?.name || 'Another firm',
        });
      }
    }
  } catch {
    // Guest deals are additive — never block the main list on this lookup.
  }

  // Merge own-firm + guest deals (own first), deduped by id.
  const mergedRaw = [...((rawDeals || []) as any[]), ...guestDeals];

  // In-memory text filter so the searchbar reacts instantly without a DB roundtrip.
  const deals = mergedRaw.filter((d: any) => {
    if (!query) return true;
    const hay = [
      d.name,
      d.client?.full_name,
      d.client?.email,
      d.realtor?.full_name,
      d.realtor?.email,
      d.phase,
      d.kind,
      d._hostFirm,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(query);
  });

  const byPhase = {
    searching: 0,
    awaiting_offer: 0,
    offer_made: 0,
    counter_offer: 0,
    under_contract: 0,
    closing: 0,
    closed: 0,
  } as Record<string, number>;
  for (const d of mergedRaw) byPhase[d.phase as string] = (byPhase[d.phase as string] || 0) + 1;
  const total = mergedRaw.length;
  const active = total - (byPhase.closed || 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Pipeline
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">Deals</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="font-semibold text-ink-900">{active}</span> active ·{' '}
            <span className="font-semibold text-ink-900">{total}</span> total
          </p>
        </div>
        <Link href="/dashboard/deals/new" className="btn-primary">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          New deal
        </Link>
      </header>

      {total === 0 && (
        <section className="surface mb-6 overflow-hidden p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-soft-sm"
              style={{ backgroundColor: me.firm_brand_color || '#0F172A' }}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-ink-900">
                Welcome to your firm's portal
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-600">
                Every deal you run gets its own workspace with phase tracking,
                shared documents, financials, messages, and a branded client app.
                You can start a deal now and add the client (or anyone else)
                inside it, or invite a client first if you prefer.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <Link href="/dashboard/deals/new" className="btn-primary text-xs">
                  Start a deal →
                </Link>
                <Link href="/dashboard/clients/new" className="btn-secondary text-xs">
                  Invite a client
                </Link>
                <Link href="/dashboard/branding" className="btn-secondary text-xs">
                  Set up branding
                </Link>
                <Link href="/dashboard/settings#mobile" className="btn-secondary text-xs">
                  Get the mobile app
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      <DealsBoard
        deals={deals as any}
        counts={byPhase}
        total={total}
        phaseFilter={phaseFilter || 'all'}
        query={query}
        view={view}
      />
    </main>
  );
}
