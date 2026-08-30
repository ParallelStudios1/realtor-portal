/**
 * Verifies the REAL FMLS mapper (not a mirror) against the fixture listing.
 *
 * Run: npx esbuild scripts/fmls-selftest.ts --bundle --format=esm \
 *        --outfile=/tmp/fmls-selftest.mjs && node /tmp/fmls-selftest.mjs
 */
import { mapResoToHouse, resoAddress } from '../lib/fmls/map';
import { FIXTURE_LISTING } from '../lib/fmls/fixture';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
  } else console.log(`ok    ${label}`);
}

const h = mapResoToHouse(FIXTURE_LISTING);

check('mls number', h.mls_number, '7412345');
check('address composed from parts', h.address, '2847 Riverbrook Trail, Marietta, GA, 30062');
check('list price', h.list_price, 485000);
check('bedrooms', h.bedrooms, 4);
check('bathrooms full+half', h.bathrooms, 2.5);
check('square feet', h.square_feet, 2640);
check('status', h.listing_status, 'Active');
check('listed date', h.listed_at, '2026-08-14');
check('listing agent', h.seller_realtor_name, 'Dana Whitfield');
check('listing office', h.seller_realtor_firm, 'Example Realty Partners');
check('first photo', h.photo_url, 'https://realtorportal.parallelstudios.co/logo.png');
check('extras include year built', h.notes?.includes('Year built: 2004'), true);
check('extras include taxes', h.notes?.includes('Annual taxes: $4,612'), true);
check('extras include HOA', h.notes?.includes('HOA: $650 / annually'), true);
check('extras include remarks', h.notes?.includes('Riverbrook community'), true);

// UnparsedAddress wins when present
check(
  'unparsed address preferred',
  resoAddress({ UnparsedAddress: '1 Peachtree St NE, Atlanta, GA 30303', City: 'X' }),
  '1 Peachtree St NE, Atlanta, GA 30303'
);
// Missing bath parts fall back to the integer total
check(
  'bath fallback to integer total',
  mapResoToHouse({ BathroomsTotalInteger: 3 }).bathrooms,
  3
);
// Sparse listing never crashes and yields nulls
const sparse = mapResoToHouse({ ListingId: '7000001' });
check('sparse listing safe', [sparse.address, sparse.list_price, sparse.notes], ['', null, null]);

console.log(failures === 0 ? '\nFMLS mapper verified.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
