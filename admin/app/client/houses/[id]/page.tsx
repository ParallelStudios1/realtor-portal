import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { HouseRatingClient } from './HouseRatingClient';

export const dynamic = 'force-dynamic';

export default async function HouseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  const { data: house } = await supabase
    .from('houses')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (!house) notFound();

  // Existing rating from this client (if any).
  // Schema uses `stars` (1-5) and `notes` (text).
  const { data: rating } = await supabase
    .from('house_ratings')
    .select('id, stars, notes')
    .eq('house_id', params.id)
    .eq('client_id', me.user_id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/client/houses"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        ← Back to houses
      </Link>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="aspect-video w-full bg-slate-100">
          {house.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={house.photo_url}
              alt={house.address}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              No photo
            </div>
          )}
        </div>

        <div className="p-5">
          <h1 className="text-2xl font-bold tracking-tight">{house.address}</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-slate-600">
            {house.list_price && (
              <span className="text-base font-semibold text-slate-900">
                ${Number(house.list_price).toLocaleString()}
              </span>
            )}
            {house.bedrooms && <span>{house.bedrooms} bedrooms</span>}
            {house.bathrooms && <span>{house.bathrooms} bathrooms</span>}
            {house.square_feet && (
              <span>{Number(house.square_feet).toLocaleString()} sqft</span>
            )}
          </div>

          {house.notes && (
            <div className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm text-slate-700">
              {house.notes}
            </div>
          )}

          {house.listing_url && (
            <a
              href={house.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
            >
              View original listing →
            </a>
          )}
        </div>
      </div>

      {/* Rating */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          What do you think?
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Your agent uses your feedback to filter what they show you next.
        </p>
        <HouseRatingClient
          houseId={house.id}
          searchId={house.search_id}
          firmId={house.firm_id}
          clientId={me.user_id}
          existing={rating || null}
        />
      </section>
    </main>
  );
}
