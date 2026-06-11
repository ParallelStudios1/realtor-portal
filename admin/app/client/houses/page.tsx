import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { SellerAddListing } from '../SellerAddListing';
import { listingStatusLabel } from '@/lib/dealKind';

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
    .select('id, phase, offer_house_id, kind')
    .eq('client_id', me.user_id);

  const searchIds = (searches || []).map((s: any) => s.id);
  const isSeller =
    (searches || []).length > 0 &&
    (searches || []).every((s: any) => s.kind === 'seller');
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
          'id, address, list_price, bedrooms, bathrooms, square_feet, photo_url, status, listing_status, created_at, listing_url, notes'
        )
        .in('search_id', searchIds)
        .order('created_at', { ascending: false })
    : { data: [] as any[] };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
          {isSeller ? 'Your listings' : 'Your search'}
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {isSeller ? 'Homes you’re selling' : 'Houses'}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {(houses?.length || 0)}{' '}
          {houses?.length === 1 ? 'property' : 'properties'}{' '}
          {isSeller ? 'on the market with your agent.' : 'from your agent.'}
        </p>
      </header>

      {!houses || houses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white bg-dotted p-12 text-center shadow-soft-sm">
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
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <path d="M9 22V12h6v10" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold">
            {isSeller ? 'No listings yet' : 'No houses yet'}
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">
            {isSeller
              ? "Add the home you're selling and your agent will take it from there."
              : "Your realtor hasn't added any properties to your search yet. When they do, they'll show up here."}
          </p>
          {isSeller && (
            <div className="mt-3 flex justify-center">
              <SellerAddListing brandColor={me.firm_brand_color} hasListings={false} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {houses.map((h: any) => {
            const badge = homeBadge.get(h.id);
            return (
            <Link
              key={h.id}
              href={`/client/houses/${h.id}`}
              className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-soft-lg"
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
                {isSeller ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                    {listingStatusLabel(h.listing_status)}
                  </div>
                ) : (
                  h.status && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                      {h.status.replace(/_/g, ' ')}
                    </div>
                  )
                )}
              </div>
            </Link>
            );
          })}
        </div>
      )}

      {isSeller && houses && houses.length > 0 && (
        <div className="mt-5">
          <SellerAddListing brandColor={me.firm_brand_color} hasListings={true} />
        </div>
      )}
    </main>
  );
}
