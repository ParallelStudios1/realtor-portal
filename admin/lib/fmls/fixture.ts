import type { ResoProperty } from './types';

/**
 * A realistic RESO-format FMLS listing for building and demoing BEFORE the
 * live Bridge credentials exist. Field names and shapes follow the RESO Data
 * Dictionary exactly, so the mapper exercised here is the same code the live
 * feed will run through.
 *
 * Any MLS number starting with "7" resolves to this house in mock mode
 * (FMLS numbers are 7-digit and currently start with 7), so reviewers and
 * demos can type a plausible number and watch the autofill work.
 */
export const FIXTURE_LISTING: ResoProperty = {
  ListingId: '7412345',
  ListingKey: 'FMLS-DEMO-7412345',
  StandardStatus: 'Active',
  ListPrice: 485000,
  OnMarketDate: '2026-08-14',
  BedroomsTotal: 4,
  BathroomsFull: 2,
  BathroomsHalf: 1,
  LivingArea: 2640,
  LotSizeAcres: 0.31,
  YearBuilt: 2004,
  TaxAnnualAmount: 4612,
  AssociationFee: 650,
  AssociationFeeFrequency: 'Annually',
  PublicRemarks:
    'Beautifully maintained 4-bed traditional on a quiet cul-de-sac in the ' +
    'sought-after Riverbrook community. Updated kitchen with quartz counters, ' +
    'finished basement, and a screened porch overlooking a private backyard.',
  StreetNumber: '2847',
  StreetName: 'Riverbrook',
  StreetSuffix: 'Trail',
  City: 'Marietta',
  StateOrProvince: 'GA',
  PostalCode: '30062',
  ListAgentFullName: 'Dana Whitfield',
  ListAgentEmail: 'dana.whitfield@example-realty.com',
  ListOfficeName: 'Example Realty Partners',
  Media: [
    { MediaURL: 'https://realtorportal.parallelstudios.co/logo.png', Order: 1 },
  ],
};
