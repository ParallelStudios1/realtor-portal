import type { ResoProperty, FmlsHousePayload } from './types';

/** Compose a display address from RESO parts, falling back to UnparsedAddress. */
export function resoAddress(p: ResoProperty): string {
  if (p.UnparsedAddress?.trim()) return p.UnparsedAddress.trim();
  const street = [p.StreetNumber, p.StreetName, p.StreetSuffix]
    .filter(Boolean)
    .join(' ');
  const unit = p.UnitNumber ? ` #${p.UnitNumber}` : '';
  const cityState = [p.City, p.StateOrProvince].filter(Boolean).join(', ');
  return [street + unit, cityState, p.PostalCode].filter(Boolean).join(', ');
}

function bathrooms(p: ResoProperty): number | null {
  // Prefer full + half*0.5 (matches how agents say "2.5 baths");
  // fall back to the integer total.
  if (p.BathroomsFull != null) {
    return p.BathroomsFull + (p.BathroomsHalf ?? 0) * 0.5;
  }
  return p.BathroomsTotalInteger ?? null;
}

function firstPhoto(p: ResoProperty): string | null {
  const media = (p.Media ?? [])
    .filter((m) => m.MediaURL)
    .sort((a, b) => (a.Order ?? 99) - (b.Order ?? 99));
  return media[0]?.MediaURL ?? null;
}

// Year built / lot / taxes / HOA now have their own columns (0069); notes
// carry only the listing's public remarks — the human description.

/**
 * RESO Property → the exact payload the house form / addHouseAction accepts.
 * Pure function: same input, same output, no I/O — so it's trivially testable
 * without touching FMLS.
 */
export function mapResoToHouse(p: ResoProperty): FmlsHousePayload {
  const listedAt = (p.OnMarketDate || p.ListingContractDate || '').slice(0, 10);
  // FMLS dialect, confirmed against their live test feed: price often arrives
  // in FMLS_CurrentPrice with ListPrice blank, and square footage in
  // BuildingAreaTotal (0 = unknown) with LivingArea blank.
  const price = p.ListPrice ?? p.FMLS_CurrentPrice ?? null;
  const sqft = p.LivingArea ?? (p.BuildingAreaTotal || null);
  return {
    mls_number: p.ListingId ?? '',
    address: resoAddress(p),
    list_price: price,
    bedrooms: p.BedroomsTotal ?? null,
    bathrooms: bathrooms(p),
    square_feet: sqft,
    photo_url: firstPhoto(p),
    listing_url: null,
    listing_status: p.StandardStatus ?? null,
    listed_at: listedAt || null,
    seller_realtor_name: p.ListAgentFullName ?? null,
    seller_realtor_email: p.ListAgentEmail ?? null,
    seller_realtor_firm: p.ListOfficeName ?? null,
    year_built: p.YearBuilt ?? null,
    lot_acres: p.LotSizeAcres ?? null,
    annual_taxes: p.TaxAnnualAmount ?? null,
    hoa_fee: p.AssociationFee ?? null,
    hoa_frequency: p.AssociationFeeFrequency ?? null,
    notes: p.PublicRemarks?.trim() || null,
  };
}
