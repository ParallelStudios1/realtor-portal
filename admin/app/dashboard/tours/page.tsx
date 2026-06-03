import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { ToursClient } from './ToursClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tours' };

/**
 * Realtor tour-request inbox. Shows all pending tours plus a tail of recently
 * confirmed/declined ones, with inline confirm/decline buttons in the client
 * component. On confirm, the mutation also writes an `important_dates` row so
 * the tour appears on both the realtor and client home screens.
 */
export default async function ToursPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  // Pull pending + recent (last 30 days) confirmed/declined for context.
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from('tour_requests')
    .select(
      `id, status, preferred_when, notes, created_at, handled_at,
       house:houses ( id, address, list_price, photo_url ),
       client:users!tour_requests_client_id_fkey ( id, full_name, email ),
       search:client_searches ( id, name )`
    )
    .eq('firm_id', me.firm_id!)
    .or(`status.eq.pending,created_at.gte.${sinceIso}`)
    .order('created_at', { ascending: false });

  // Errors here are unexpected — RLS already filters by firm. Surface a
  // friendly message but don't blow up the page.
  const tours = (rows || []).map((r: any) => ({
    id: r.id,
    status: r.status as 'pending' | 'confirmed' | 'declined' | 'cancelled',
    preferred_when: r.preferred_when,
    notes: r.notes,
    created_at: r.created_at,
    handled_at: r.handled_at,
    house_id: r.house?.id || null,
    house_address: r.house?.address || null,
    house_photo_url: r.house?.photo_url || null,
    house_list_price: r.house?.list_price ?? null,
    client_id: r.client?.id || null,
    client_name: r.client?.full_name || r.client?.email || 'Unknown client',
    client_email: r.client?.email || null,
    search_id: r.search?.id || null,
    search_name: r.search?.name || null,
  }));

  const pending = tours.filter((t) => t.status === 'pending');
  const recent = tours.filter((t) => t.status !== 'pending');

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Scheduling
        </div>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink-900">Tours</h1>
        <p className="mt-1 text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{pending.length}</span> pending{' '}
          {pending.length === 1 ? 'request' : 'requests'}
          {recent.length > 0 ? ` · ${recent.length} recent` : ''}.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load tour requests: {error.message}
        </div>
      )}

      {tours.length === 0 ? (
        <div className="bg-dotted rounded-2xl border border-dashed border-ink-300 bg-white p-14 text-center shadow-soft-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-soft-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-7 w-7" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink-900">No tour requests yet</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">
            When clients request a tour from the mobile app, you'll see them
            here and can confirm or decline with one tap.
          </p>
        </div>
      ) : (
        <ToursClient firmId={me.firm_id!} pending={pending} recent={recent} />
      )}
    </main>
  );
}
