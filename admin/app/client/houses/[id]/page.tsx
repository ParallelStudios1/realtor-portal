import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { HouseRatingClient } from './HouseRatingClient';
import { ScheduleVisitClient } from './ScheduleVisitClient';
import { AgreedHouseClient } from './AgreedHouseClient';

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

  // CLIENT ↔ REALTOR HOUSE AGREEMENT — resolve this client's deal for this
  // house so we can render the "This is the house I want" control + reflect
  // whichever home is currently agreed (set by either side).
  const { data: agreementSearch } = await supabase
    .from('client_searches')
    .select('id, client_id, offer_house_id, house_agreed_at')
    .eq('id', house.search_id)
    .maybeSingle();
  const isPrincipalClient =
    (agreementSearch as any)?.client_id === me.user_id;
  const agreedHouseId = (agreementSearch as any)?.offer_house_id as
    | string
    | null;
  const houseIsAgreed = (agreementSearch as any)?.house_agreed_at != null;
  let agreementState: 'agreedHere' | 'agreedElsewhere' | 'none' = 'none';
  let agreedAddress: string | null = null;
  if (houseIsAgreed && agreedHouseId === house.id) {
    agreementState = 'agreedHere';
  } else if (houseIsAgreed && agreedHouseId) {
    agreementState = 'agreedElsewhere';
    const { data: other } = await supabase
      .from('houses')
      .select('address')
      .eq('id', agreedHouseId)
      .maybeSingle();
    agreedAddress = (other as any)?.address ?? null;
  }

  // Brand color for the agreement control accent.
  const { data: agFirm } = me.firm_id
    ? await supabase
        .from('firms')
        .select('brand_color')
        .eq('id', me.firm_id)
        .maybeSingle()
    : { data: null };
  const agBrandColor =
    ((agFirm as any)?.brand_color as string | null) ||
    me.firm_brand_color ||
    null;

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
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/client/houses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to houses
      </Link>

      <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-md">
        <div className="aspect-video w-full bg-ink-100">
          {house.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={house.photo_url}
              alt={house.address}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-400">
              No photo
            </div>
          )}
        </div>

        <div className="p-5">
          <h1 className="text-2xl font-bold tracking-tight">{house.address}</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-ink-600">
            {house.list_price && (
              <span className="text-base font-semibold text-ink-900">
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
            <div className="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                From your agent
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700">
                {house.notes}
              </p>
            </div>
          )}

          {house.listing_url && (
            <a
              href={house.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink-900 hover:underline"
            >
              View original listing
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 17 7M7 7h10v10" />
              </svg>
            </a>
          )}

          <ScheduleVisitClient
            houseId={house.id}
            pendingTour={pendingTour || null}
          />

          {isPrincipalClient && (
            <AgreedHouseClient
              houseId={house.id}
              brandColor={agBrandColor}
              state={agreementState}
              agreedAddress={agreedAddress}
            />
          )}
        </div>
      </div>

      {/* Rating */}
      <section
        className={
          'mt-6 rounded-2xl border bg-white p-5 shadow-soft ' +
          (showPostTourPrompt
            ? 'border-amber-300 ring-2 ring-amber-100'
            : 'border-ink-200')
        }
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
          {showPostTourPrompt
            ? 'How was the tour?'
            : 'What do you think?'}
        </div>
        <p className="mt-1 text-sm text-ink-600">
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
