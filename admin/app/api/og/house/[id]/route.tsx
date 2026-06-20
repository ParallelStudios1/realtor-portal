import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/og/house/[id]
 *
 * Returns a 1200x630 PNG OG/social-share image for a house listing.
 * Composes:
 *   - house photo as background (low opacity) when present
 *   - firm logo top-left (small)
 *   - large address text
 *   - price chip
 *   - beds / baths / sqft badges
 *   - accent color from the firm's brand_color (fallback primary_color)
 *
 * Cached for 24h on the edge: clients pulling the OG tag for previews don't
 * need a fresh render every time. If the listing changes, the URL stays the
 * same - purge or wait out the cache.
 */
export const runtime = 'edge';

// Tell Next this route is dynamic (params come from a UUID; no static gen).
export const dynamic = 'force-dynamic';

const W = 1200;
const H = 630;

// A safe default tint when the firm has no brand color and the house has no
// photo. Slate-900-ish so the white text reads.
const DEFAULT_ACCENT = '#0F172A';

type HouseRow = {
  id: string;
  firm_id: string | null;
  address: string | null;
  list_price: number | string | null;
  bedrooms: number | null;
  bathrooms: number | string | null;
  square_feet: number | null;
  photo_url: string | null;
};

type FirmRow = {
  id: string;
  name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  primary_color: string | null;
};

/**
 * Edge-safe service-role client. We can't use the Node helper here because
 * `cookies()` and process env access patterns differ - but supabase-js works
 * over fetch in the edge runtime just fine.
 */
function edgeServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE env vars for OG image route.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function formatPrice(p: HouseRow['list_price']): string | null {
  if (p === null || p === undefined || p === '') return null;
  const n = typeof p === 'string' ? Number(p) : p;
  if (!Number.isFinite(n)) return null;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Render an in-memory 1x1 PNG fallback so we never throw a 500 from this
 * route (broken OG = broken share previews everywhere). 'image/png' header
 * is set by ImageResponse for us; here we return a tiny tinted card.
 */
function fallbackImage(message: string, accent = DEFAULT_ACCENT) {
  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: accent,
          color: '#fff',
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        {message}
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    }
  );
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const houseId = params.id;
  if (!houseId) {
    return fallbackImage('Listing');
  }

  let house: HouseRow | null = null;
  let firm: FirmRow | null = null;

  try {
    const supabase = edgeServiceRoleClient();

    const { data: houseRow } = await supabase
      .from('houses')
      .select(
        'id, firm_id, address, list_price, bedrooms, bathrooms, square_feet, photo_url'
      )
      .eq('id', houseId)
      .maybeSingle();

    house = (houseRow as HouseRow) ?? null;

    if (house?.firm_id) {
      const { data: firmRow } = await supabase
        .from('firms')
        .select('id, name, logo_url, brand_color, primary_color')
        .eq('id', house.firm_id)
        .maybeSingle();
      firm = (firmRow as FirmRow) ?? null;
    }
  } catch {
    // Fall through - render a generic image rather than 500.
  }

  if (!house) {
    return fallbackImage('Listing');
  }

  const accent =
    (firm?.brand_color && firm.brand_color.trim()) ||
    (firm?.primary_color && firm.primary_color.trim()) ||
    DEFAULT_ACCENT;

  const address = house.address || 'Listing';
  const price = formatPrice(house.list_price);
  const beds = house.bedrooms ?? null;
  const baths = house.bathrooms ?? null;
  const sqft = house.square_feet ?? null;
  const hasPhoto = !!(house.photo_url && house.photo_url.startsWith('http'));

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          // Base layer: solid accent color. Photo (if any) sits on top at
          // reduced opacity to keep text legible.
          background: accent,
          color: '#fff',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* Background photo, dimmed. Satori/ImageResponse supports <img>. */}
        {hasPhoto && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={house.photo_url as string}
            width={W}
            height={H}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: W,
              height: H,
              objectFit: 'cover',
              opacity: 0.35,
            }}
          />
        )}

        {/* Dark gradient veil so the bottom text always reads, even on a
            light photo. Pure flexbox div with a linear-gradient background. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.75) 100%)',
          }}
        />

        {/* Top bar: firm logo + name */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            padding: '40px 56px 0 56px',
            gap: 18,
          }}
        >
          {firm?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={firm.logo_url}
              width={56}
              height={56}
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                objectFit: 'cover',
                background: '#fff',
              }}
            />
          ) : (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {(firm?.name || 'R').charAt(0).toUpperCase()}
            </div>
          )}
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              opacity: 0.95,
              display: 'flex',
            }}
          >
            {firm?.name || 'Realtor Portal'}
          </div>
        </div>

        {/* Spacer pushes content to the bottom */}
        <div style={{ flex: 1, display: 'flex' }} />

        {/* Bottom: price chip, address, badges */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            padding: '0 56px 56px 56px',
            gap: 20,
          }}
        >
          {price && (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                background: '#fff',
                color: accent,
                padding: '10px 22px',
                borderRadius: 999,
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: '-0.01em',
              }}
            >
              {price}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              // Cap height so a long address wraps cleanly. Satori supports
              // basic wrapping; we trust flex to handle it.
              maxWidth: W - 112,
            }}
          >
            {address}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {beds !== null && beds !== undefined && (
              <Badge accent={accent}>{`${beds} bed${beds === 1 ? '' : 's'}`}</Badge>
            )}
            {baths !== null && baths !== undefined && (
              <Badge accent={accent}>{`${baths} bath${
                Number(baths) === 1 ? '' : 's'
              }`}</Badge>
            )}
            {sqft !== null && sqft !== undefined && (
              <Badge accent={accent}>{`${Number(sqft).toLocaleString(
                'en-US'
              )} sqft`}</Badge>
            )}
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    }
  );
}

function Badge({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.92)',
        color: accent,
        padding: '8px 18px',
        borderRadius: 999,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: '-0.005em',
      }}
    >
      {children}
    </div>
  );
}
