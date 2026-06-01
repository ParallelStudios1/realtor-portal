import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Houses' };

export default async function ClientHousesPage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
  const supabase = getSupabaseServerClient();

  // Find this client's active searches → all houses across them. We also
  // pull each search's phase + offer_house_id so we can flag the home they
  // actually bought once a deal closes ("Your home" badge).
  const { data: searches } = await supabase
    .from('client_searches')
    .select('id, phase, offer_house_id')
    .eq('client_id', me.user_id);

  const searchIds = (searches || []).map((s: any) => s.id);
  // Map of house id -> 'closed-home' | 'pending-home' | undefined
  const homeBadge = new Map<string, 'closed-home' | 'pending-home'>();
  for (const s of (searches || []) as any[]) {
    if (!s.offer_house_id) continue;
    if (s.phase === 'closed') homeBadge.set(s.offer_house_id, 'closed-home');
    else if (
      s.phase === 'under_contract' ||
      s.phase === 'closing' ||
      s.phase === 'offer_made' ||
      s.phase === 'counter_offer'
    )
      homeBadge.set(s.offer_house_id, 'pending-home');
  }

  const { data: houses } = searchIds.length
    ? await supabase
        .from('houses')
        .select(
          'id, address, list_price, bedrooms, bathrooms, square_feet, photo_url, status, created_at, listing_url, notes'
        )
        .in('search_id', searchIds)
        .order('created_at', { ascending: false })
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Houses</h1>
        <p className="mt-1 text-sm text-ink-600">
          {(houses?.length || 0)} {houses?.length === 1 ? 'property' : 'properties'} from your agent.
        </p>
      </header>

      {!houses || houses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-300 bg-white p-10 text-center">
          <h3 className="text-base font-semibold">No houses yet</h3>
          <p className="mt-1 text-sm text-ink-600">
            Your realtor hasn't added any properties to your search yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {houses.map((h: any) => {
            const badge = homeBadge.get(h.id);
            return (
            <Link
              key={h.id}
              href={`/client/houses/${h.id}`}
              className="group relative overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition hover:shadow-md"
            >
              {badge === 'closed-home' && (
                <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                  Your home
                </div>
              )}
              {badge === 'pending-home' && (
                <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                  Your offer
                </div>
              )}
              <div className="aspect-video w-full bg-ink-100">
                {h.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.photo_url}
                    alt={h.address}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-ink-400">
                    No photo
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="text-base font-semibold leading-tight">
                  {h.address}
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-ink-600">
                  {h.list_price && (
                    <span className="font-semibold text-ink-900">
                      ${Number(h.list_price).toLocaleString()}
                    </span>
                  )}
                  {h.bedrooms && <span>{h.bedrooms} bd</span>}
                  {h.bathrooms && <span>{h.bathrooms} ba</span>}
                  {h.square_feet && (
                    <span>{Number(h.square_feet).toLocaleString()} sqft</span>
                  )}
                </div>
                {h.status && (
                  <div className="mt-3 inline-block rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                    {h.status.replace(/_/g, ' ')}
                  </div>
                )}
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
