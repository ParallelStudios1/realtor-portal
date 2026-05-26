import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { HouseRatingClient } from './HouseRatingClient';
import { ScheduleVisitClient } from './ScheduleVisitClient';

export const dynamic = 'force-dynamic';

/**
 * Generate the social-share metadata for this listing. The OG image is
 * rendered on demand by /api/og/house/[id] (24h cache).
 *
 * We deliberately keep this lightweight and don't hit the DB — the OG route
 * does that work, and that result is already cached. Title/description here
 * stay generic so we don't leak listing details to unauthenticated metadata
 * scrapers beyond what's already in the OG image they fetch anyway.
 */
export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const ogUrl = `/api/og/house/${params.id}`;
  const title = 'Listing';
  const description = 'A house your agent picked out for you.';
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [
        {
          url: ogUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  };
}

export default async function HouseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }
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

  // Look for a recently-confirmed tour on this house so we can show the
  // "How was the tour?" banner — fires once the tour's preferred_when is
  // in the past and the client hasn't rated yet.
  const { data: recentTour } = await supabase
    .from('tour_requests')
    .select('id, status, preferred_when, handled_at')
    .eq('house_id', params.id)
    .eq('client_id', me.user_id)
    .eq('status', 'confirmed')
    .order('handled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const showPostTourPrompt = (() => {
    if (!recentTour) return false;
    if (rating) return false; // already rated
    const when = recentTour.preferred_when
      ? new Date(recentTour.preferred_when)
      : null;
    if (!when) return true; // confirmed but no datetime — prompt anyway
    return when.getTime() < Date.now();
  })();

  // Any tour the client has open for this house — used to swap the button
  // for a "pending" badge instead of letting them double-request.
  const { data: pendingTour } = await supabase
    .from('tour_requests')
    .select('id, preferred_when')
    .eq('house_id', params.id)
    .eq('client_id', me.user_id)
    .eq('status', 'pending')
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

          <ScheduleVisitClient
            houseId={house.id}
            pendingTour={pendingTour || null}
          />
        </div>
      </div>

      {/* Rating */}
      <section
        className={
          'mt-6 rounded-xl border bg-white p-5 ' +
          (showPostTourPrompt
            ? 'border-amber-300 ring-2 ring-amber-100'
            : 'border-slate-200')
        }
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {showPostTourPrompt
            ? 'How was the tour?'
            : 'What do you think?'}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {showPostTourPrompt
            ? 'You just toured this place. Rate it 1–5 and add a note — your agent reads this to find better matches.'
            : 'Your agent uses your feedback to filter what they show you next.'}
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
