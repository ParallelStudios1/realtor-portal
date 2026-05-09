import Link from 'next/link';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Houses' };

export default async function ClientHousesPage() {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  // Find this client's active searches → all houses across them
  const { data: searches } = await supabase
    .from('client_searches')
    .select('id')
    .eq('client_id', me.user_id);

  const searchIds = (searches || []).map((s: any) => s.id);

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
        <p className="mt-1 text-sm text-slate-600">
          {(houses?.length || 0)} {houses?.length === 1 ? 'property' : 'properties'} from your agent.
        </p>
      </header>

      {!houses || houses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h3 className="text-base font-semibold">No houses yet</h3>
          <p className="mt-1 text-sm text-slate-600">
            Your realtor hasn't added any properties to your search yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {houses.map((h: any) => (
            <Link
              key={h.id}
              href={`/client/houses/${h.id}`}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="aspect-video w-full bg-slate-100">
                {h.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.photo_url}
                    alt={h.address}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No photo
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="text-base font-semibold leading-tight">
                  {h.address}
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-600">
                  {h.list_price && (
                    <span className="font-semibold text-slate-900">
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
                  <div className="mt-3 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {h.status.replace(/_/g, ' ')}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
