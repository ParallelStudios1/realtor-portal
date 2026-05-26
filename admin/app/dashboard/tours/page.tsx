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
    const { redirect } = await import('next/navigation');
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
        <h1 className="text-3xl font-bold tracking-tight">Tours</h1>
        <p className="mt-1 text-sm text-slate-600">
          {pending.length} pending {pending.length === 1 ? 'request' : 'requests'}
          {recent.length > 0 ? ` · ${recent.length} recent` : ''}.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load tour requests: {error.message}
        </div>
      )}

      {tours.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <h3 className="font-semibold">No tour requests yet</h3>
          <p className="mt-1 text-sm text-slate-600">
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
