/**
 * Guards App Store Guideline 3.1.2(c).
 *
 * Apple requires the APP ITSELF to show, at the point of sale:
 *   1. Title of the auto-renewing subscription
 *   2. Length of the subscription
 *   3. Price, and price per unit
 *   4. Functional links to Privacy Policy and Terms of Use (EULA)
 *
 * Realtor Portal was rejected on 2026-08-03 for missing #2 — the paywall
 * showed "$99.99" with no period and never said what you get each period.
 * This asserts each element is still rendered, so a future edit can't quietly
 * drop one and cost another review cycle.
 *
 * Run: node scripts/verify-subscription-disclosure.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const paywall = readFileSync(join(here, '..', 'app', '(realtor)', 'subscribe.tsx'), 'utf8');
const iap = readFileSync(join(here, '..', 'lib', 'iap.ts'), 'utf8');

let failures = 0;
function check(label, ok, hint) {
  if (ok) {
    console.log(`ok    ${label}`);
  } else {
    failures++;
    console.error(`FAIL  ${label}${hint ? `\n      ${hint}` : ''}`);
  }
}

// 1. Title — each plan renders its product display name.
check(
  '3.1.2(c) #1 subscription title is shown',
  /\{p\.title\}/.test(paywall),
  'The paywall must render each product title.'
);

// 2. Length — the period must appear next to the price AND in the legal block.
check(
  '3.1.2(c) #2 subscription length shown per plan',
  /p\.periodLabel/.test(paywall),
  'Each plan row must state its period, e.g. "$99.99 per month".'
);
check(
  '3.1.2(c) #2 period is derived from StoreKit, not hardcoded',
  /subscriptionPeriodUnitIOS/.test(iap),
  'periodLabelFrom() should read the real period so it cannot drift.'
);
check(
  '3.1.2(c) #2 length restated in the terms paragraph',
  /1-month auto-renewing subscriptions/.test(paywall),
  'The legal block must state the subscription length in words.'
);

// What the subscriber gets during each period.
check(
  '3.1.2(c) per-period entitlement is described',
  /entitlement/.test(paywall) && /Up to 3 agents/.test(iap),
  'Apple asks for the services provided during each subscription period.'
);

// 3. Price.
check(
  '3.1.2(c) #3 price is shown',
  /p\.displayPrice/.test(paywall),
  'Use StoreKit displayPrice so it is always the localized, real price.'
);

// 4. Functional links.
check(
  '3.1.2(c) #4 Terms of Use link present',
  /Terms of Use/.test(paywall) && /\/terms/.test(paywall),
  'A tappable Terms of Use (EULA) link is required at point of sale.'
);
check(
  '3.1.2(c) #4 Privacy Policy link present',
  /Privacy Policy/.test(paywall) && /\/privacy/.test(paywall),
  'A tappable Privacy Policy link is required at point of sale.'
);

// Auto-renew disclosure.
check(
  'auto-renew disclosure present',
  /renews automatically/.test(paywall) && /cancel/i.test(paywall),
  'Apple requires a plain statement that the subscription auto-renews.'
);

console.log(
  failures === 0
    ? '\nPaywall satisfies Guideline 3.1.2(c).'
    : `\n${failures} disclosure requirement(s) MISSING — Apple will reject this.`
);
process.exit(failures === 0 ? 0 : 1);
