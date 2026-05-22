import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/value/estimate
 * Body: { address: string }
 *
 * Returns: { mid, low, high, comps_count, city }
 *
 * Simulated automated valuation model (AVM). We do NOT pay for a real AVM
 * here — the math below derives a believable price from a deterministic
 * hash of the address string, biased by detected city. Every call with the
 * same address returns the same numbers so the lead-capture step doesn't
 * show a different range when the visitor refreshes.
 *
 * TODO: replace the simulated math with a real AVM provider when we're
 * ready to pay for one. Good candidates:
 *   - Estated (estated.com) — REST, per-call pricing, US-only
 *   - ATTOM Data (attomdata.com) — broader coverage, requires contract
 *   - HouseCanary (housecanary.com) — premium accuracy, requires contract
 * The replacement should keep the same return shape so the client doesn't
 * have to change. If the provider returns its own low/high we use theirs;
 * otherwise we wrap their point estimate with the same ±8% band.
 */

type EstimateBody = { address?: string; firmId?: string };

// Rough city → median single-family price baseline (USD). Used only to
// nudge the simulated number into a believable bucket so a Manhattan
// address doesn't get priced like a Tulsa one. These are deliberately
// round; the demo doesn't pretend to be Zillow.
const CITY_BASELINES: Array<{ match: RegExp; mid: number }> = [
  { match: /\b(new york|nyc|manhattan|brooklyn|queens|bronx)\b/i, mid: 1_350_000 },
  { match: /\b(san francisco|sf|oakland|berkeley|palo alto|mountain view)\b/i, mid: 1_500_000 },
  { match: /\b(los angeles|la|santa monica|venice|pasadena|burbank)\b/i, mid: 1_100_000 },
  { match: /\b(boston|cambridge|somerville|brookline)\b/i, mid: 950_000 },
  { match: /\b(seattle|bellevue|redmond)\b/i, mid: 880_000 },
  { match: /\b(washington|dc|arlington|alexandria|bethesda)\b/i, mid: 820_000 },
  { match: /\b(miami|fort lauderdale|coral gables|boca raton)\b/i, mid: 720_000 },
  { match: /\b(denver|boulder|aurora)\b/i, mid: 640_000 },
  { match: /\b(austin|round rock)\b/i, mid: 580_000 },
  { match: /\b(chicago|evanston|naperville)\b/i, mid: 470_000 },
  { match: /\b(portland|beaverton)\b/i, mid: 560_000 },
  { match: /\b(atlanta|decatur|sandy springs)\b/i, mid: 430_000 },
  { match: /\b(nashville|franklin|brentwood)\b/i, mid: 510_000 },
  { match: /\b(phoenix|scottsdale|tempe|mesa)\b/i, mid: 460_000 },
  { match: /\b(dallas|plano|frisco|irving)\b/i, mid: 470_000 },
  { match: /\b(houston|katy|sugar land)\b/i, mid: 380_000 },
  { match: /\b(philadelphia|philly)\b/i, mid: 320_000 },
  { match: /\b(detroit|ann arbor)\b/i, mid: 240_000 },
  { match: /\b(cleveland|akron)\b/i, mid: 200_000 },
  { match: /\b(pittsburgh)\b/i, mid: 240_000 },
  { match: /\b(tulsa|oklahoma city|okc)\b/i, mid: 230_000 },
  { match: /\b(buffalo|rochester|syracuse)\b/i, mid: 220_000 },
];

// Default baseline for an address that doesn't match any known city above.
const DEFAULT_BASELINE = 425_000;

/**
 * Deterministic 32-bit hash of a string. Cheap, stable across processes —
 * we only need it to seed a believable variation per address, not for
 * security. Same address always returns the same number.
 */
function hashAddress(addr: string): number {
  let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  const s = addr.toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function detectBaseline(addr: string): { mid: number; city: string } {
  for (const row of CITY_BASELINES) {
    if (row.match.test(addr)) {
      // Pull the matched city substring for nicer display.
      const m = addr.match(row.match);
      const city = m ? m[0].replace(/\b\w/g, (c) => c.toUpperCase()) : '';
      return { mid: row.mid, city };
    }
  }
  return { mid: DEFAULT_BASELINE, city: '' };
}

/** Round to the nearest $1,000 so the demo doesn't show $437,213. */
function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as EstimateBody;
    const address = (body.address || '').trim();
    if (!address || address.length < 6) {
      return NextResponse.json(
        { error: 'Please enter a full street address.' },
        { status: 400 }
      );
    }
    // Validate firmId — must be a UUID and exist in the firms table.
    // Without this, anyone can POST estimates with no firm attribution,
    // which breaks per-firm rate-limiting / attribution tracking later.
    const firmId = (body.firmId || '').trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        firmId
      )
    ) {
      return NextResponse.json(
        { error: 'Invalid firmId.' },
        { status: 400 }
      );
    }
    const { getSupabaseServiceRoleClient } = await import('@/lib/supabaseServer');
    const service = getSupabaseServiceRoleClient();
    const { data: firm } = await service
      .from('firms')
      .select('id')
      .eq('id', firmId)
      .maybeSingle();
    if (!firm) {
      return NextResponse.json(
        { error: 'Unknown firm.' },
        { status: 404 }
      );
    }

    const { mid: baseline, city } = detectBaseline(address);
    const hash = hashAddress(address);

    // Spread: ±30% of the baseline, distributed across the 32-bit hash space.
    // This turns the address hash into a believable midpoint variation so two
    // addresses on the same street don't return identical numbers.
    const spread = baseline * 0.3;
    const offset = ((hash % 10_000) / 10_000) * (spread * 2) - spread;
    const rawMid = baseline + offset;

    const mid = roundTo(rawMid, 1_000);
    // ±8% band per the spec.
    const low = roundTo(mid * 0.92, 1_000);
    const high = roundTo(mid * 1.08, 1_000);

    // Believable comp count derived from the same hash — usually 6-14.
    const comps_count = 6 + (hash % 9);

    return NextResponse.json({
      mid,
      low,
      high,
      comps_count,
      city: city || null,
      // Echo back the address we used so the client doesn't have to
      // re-normalize when displaying it.
      address,
    });
  } catch (err: any) {
    console.error('[api/value/estimate]', err);
    return NextResponse.json(
      { error: err?.message || 'Unable to estimate this address.' },
      { status: 500 }
    );
  }
}
