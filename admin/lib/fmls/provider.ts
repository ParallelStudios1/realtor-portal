import type { FmlsLookupResult, ResoProperty } from './types';
import { mapResoToHouse } from './map';
import { FIXTURE_LISTING } from './fixture';

/**
 * FMLS listing lookup with two modes, chosen by environment:
 *
 *   LIVE  - all three FMLS_BRIDGE_* vars set → Bridge Interactive RESO
 *           Web API (the feed FMLS grants after Marketplace approval).
 *   MOCK  - FMLS_MOCK=1 → the fixture listing, for local dev and demos.
 *
 * Neither set → feature reports itself unavailable. Nothing about FMLS is
 * reachable in production until the real credentials are configured — which
 * is exactly the "no deploy until the keys exist" contract.
 *
 * Bridge RESO Web API shape (per Bridge docs):
 *   GET {base}/{dataset}/Property?access_token=...&$filter=ListingId eq '<mls>'
 *   →  { value: [ ResoProperty, ... ] }
 * Media usually arrives via $expand=Media.
 */

const BASE = process.env.FMLS_BRIDGE_BASE_URL; // e.g. https://api.bridgedataoutput.com/api/v2/OData
const DATASET = process.env.FMLS_BRIDGE_DATASET; // assigned by Bridge, e.g. 'fmls'
const TOKEN = process.env.FMLS_BRIDGE_ACCESS_TOKEN;

export function fmlsMode(): 'live' | 'mock' | 'off' {
  if (BASE && DATASET && TOKEN) return 'live';
  if (process.env.FMLS_MOCK === '1') return 'mock';
  return 'off';
}

export async function lookupFmlsListing(
  mlsNumberRaw: string
): Promise<FmlsLookupResult> {
  const mls = (mlsNumberRaw || '').trim().replace(/[^0-9A-Za-z]/g, '');
  if (!mls) return { ok: false, error: 'Enter an FMLS number.' };

  const mode = fmlsMode();
  if (mode === 'off') {
    return {
      ok: false,
      error: 'FMLS lookup is not enabled on this server yet.',
    };
  }

  if (mode === 'mock') {
    // Any plausible FMLS number (7 digits, leading 7) hits the demo listing,
    // echoing the number back so the flow feels real end to end.
    if (!/^7\d{6}$/.test(mls)) {
      return { ok: false, error: `No FMLS listing found for #${mls}.` };
    }
    const house = mapResoToHouse({ ...FIXTURE_LISTING, ListingId: mls });
    return { ok: true, source: 'mock', house };
  }

  try {
    const url =
      `${BASE!.replace(/\/$/, '')}/${DATASET}/Property` +
      `?access_token=${encodeURIComponent(TOKEN!)}` +
      `&$filter=${encodeURIComponent(`ListingId eq '${mls}'`)}` +
      `&$expand=Media&$top=1`;
    const r = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!r.ok) {
      return {
        ok: false,
        error: `FMLS feed error (HTTP ${r.status}). Try again in a moment.`,
      };
    }
    const json = (await r.json()) as { value?: ResoProperty[] };
    const listing = json.value?.[0];
    if (!listing) {
      return { ok: false, error: `No FMLS listing found for #${mls}.` };
    }
    return { ok: true, source: 'live', house: mapResoToHouse(listing) };
  } catch (e: any) {
    return {
      ok: false,
      error: 'Could not reach the FMLS feed: ' + (e?.message || 'network error'),
    };
  }
}
