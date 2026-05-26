import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
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
    const { redirect } = await import('next/navigation');
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

  // In-memory text filter so the searchbar reacts instantly without a DB roundtrip.
  const deals = (rawDeals || []).filter((d: any) => {
    if (!query) return true;
    const hay = [
      d.name,
      d.client?.full_name,
      d.client?.email,
      d.realtor?.full_name,
      d.realtor?.email,
      d.phase,
      d.kind,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(query);
  });

  const byPhase = {
    searching: 0,
    offer_made: 0,
    counter_offer: 0,
    under_contract: 0,
    closing: 0,
    closed: 0,
  } as Record<string, number>;
  for (const d of rawDeals || []) byPhase[d.phase as string] = (byPhase[d.phase as string] || 0) + 1;
  const total = (rawDeals || []).length;
  const active = total - (byPhase.closed || 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deals</h1>
          <p className="mt-1 text-sm text-ink-600">
            {active} active · {total} total
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
        <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-soft-sm">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinejoin="round" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-blue-950">
                Welcome to your firm's portal
              </h2>
              <p className="mt-1 text-sm text-blue-900/80">
                Every deal you run gets its own workspace with phase tracking,
                shared documents, financials, messages, and a branded client app.
                You can start a deal now and add the client (or anyone else)
                inside it, or invite a client first if you prefer.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link
                  href="/dashboard/deals/new"
                  className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white shadow-soft-sm transition hover:bg-blue-700"
                >
                  Start a deal →
                </Link>
                <Link
                  href="/dashboard/clients/new"
                  className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold text-blue-800 transition hover:bg-blue-50"
                >
                  Invite a client
                </Link>
                <Link
                  href="/dashboard/branding"
                  className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold text-blue-800 transition hover:bg-blue-50"
                >
                  Set up branding
                </Link>
                <Link
                  href="/dashboard/settings#mobile"
                  className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold text-blue-800 transition hover:bg-blue-50"
                >
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
