/**
 * FMLS (First MLS, Georgia) listing lookup — shared types.
 *
 * The feed is RESO Web API via Bridge Interactive. RESO standardizes the
 * field names (ListingId, ListPrice, BedroomsTotal, ...) so one mapper works
 * for the live feed and for fixtures.
 */

/** The subset of a RESO Property record we consume. */
export type ResoProperty = {
  ListingId?: string; // the MLS number agents type
  ListingKey?: string;
  StandardStatus?: string; // Active | Pending | Closed | ...
  ListPrice?: number;
  ClosePrice?: number;
  CloseDate?: string;
  OnMarketDate?: string;
  ListingContractDate?: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  BathroomsFull?: number;
  BathroomsHalf?: number;
  LivingArea?: number; // square feet
  /** FMLS often reports square footage here instead of LivingArea. */
  BuildingAreaTotal?: number;
  /** FMLS custom field; present when ListPrice is blanked. */
  FMLS_CurrentPrice?: number;
  /** FMLS's "Allow Internet Display" — false means do not surface at all. */
  InternetEntireListingDisplayYN?: boolean;
  LotSizeAcres?: number;
  YearBuilt?: number;
  TaxAnnualAmount?: number;
  AssociationFee?: number;
  AssociationFeeFrequency?: string;
  PublicRemarks?: string;
  // Address parts
  UnparsedAddress?: string;
  StreetNumber?: string;
  StreetName?: string;
  StreetSuffix?: string;
  UnitNumber?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  // Listing side
  ListAgentFullName?: string;
  ListAgentEmail?: string;
  ListOfficeName?: string;
  // Media (photos)
  Media?: Array<{ MediaURL?: string; Order?: number }>;
};

/**
 * What the lookup hands the app: exactly the shape addHouseAction / the house
 * form understands, so autofill is a straight object spread.
 */
export type FmlsHousePayload = {
  mls_number: string;
  address: string;
  list_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  photo_url: string | null;
  listing_url: null; // FMLS feed has no public URL; agents can add one
  listing_status: string | null;
  listed_at: string | null; // YYYY-MM-DD
  seller_realtor_name: string | null;
  seller_realtor_email: string | null;
  seller_realtor_firm: string | null;
  /** Dedicated house-fact columns (migration 0069). */
  year_built: number | null;
  lot_acres: number | null;
  annual_taxes: number | null;
  hoa_fee: number | null;
  hoa_frequency: string | null;
  /** The listing's public remarks — the human description. */
  notes: string | null;
};

export type FmlsLookupResult =
  | { ok: true; source: 'live' | 'mock'; house: FmlsHousePayload }
  | { ok: false; error: string };
