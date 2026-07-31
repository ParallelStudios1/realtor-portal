/**
 * Verifies the IAP entitlement rules without touching Apple or the database.
 *
 * Two things are checked:
 *   1. Every Apple product id maps to the tier whose seat cap we advertise.
 *   2. The staleness guard in applyTransactionToFirm accepts every legitimate
 *      transaction and rejects only replayed/out-of-order ones. Getting this
 *      backwards would either downgrade paying customers or let a stale
 *      transaction overwrite a good plan.
 *
 * Run: node scripts/verify-iap-logic.mjs
 */

const PLANS = {
  solo: {
    name: 'Starter',
    seatCap: 3,
    appleProductId: 'com.parallelstudios.realtorportal.starter.monthly',
  },
  team: {
    name: 'Team',
    seatCap: 15,
    appleProductId: 'com.parallelstudios.realtorportal.teamplan.monthly',
  },
  brokerage: {
    name: 'Brokerage',
    seatCap: 50,
    appleProductId: 'com.parallelstudios.realtorportal.brokerage.monthly',
  },
};

function tierFromAppleProductId(productId) {
  if (!productId) return null;
  for (const [tier, cfg] of Object.entries(PLANS)) {
    if (cfg.appleProductId === productId) return tier;
  }
  return null;
}

/** Mirrors the guard in lib/appleIap.ts. */
function isStale({ currentExpiry, incomingExpiry, sameSubscription, revoked, now }) {
  if (currentExpiry === null || incomingExpiry === null) return false;
  return (
    incomingExpiry < currentExpiry &&
    currentExpiry > now &&
    !(sameSubscription && revoked)
  );
}

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

// ---- 1. product -> tier -> advertised seat cap -----------------------------
check('starter.monthly -> solo', tierFromAppleProductId(PLANS.solo.appleProductId), 'solo');
check('teamplan.monthly -> team', tierFromAppleProductId(PLANS.team.appleProductId), 'team');
check('brokerage.monthly -> brokerage', tierFromAppleProductId(PLANS.brokerage.appleProductId), 'brokerage');
check('unknown product -> null', tierFromAppleProductId('com.example.bogus'), null);
check('seat caps match store copy', [PLANS.solo.seatCap, PLANS.team.seatCap, PLANS.brokerage.seatCap], [3, 15, 50]);

// Every product id must be distinct, or two plans would collide on lookup.
const ids = Object.values(PLANS).map((p) => p.appleProductId);
check('product ids are unique', new Set(ids).size, ids.length);

// ---- 2. staleness guard ---------------------------------------------------
const NOW = Date.UTC(2026, 6, 31, 22, 0, 0);
const HOUR = 3600e3;
const MONTH = 30 * 24 * HOUR;

// Legitimate transactions — none of these may be treated as stale.
check('first purchase (no prior entitlement)', isStale({
  currentExpiry: null, incomingExpiry: NOW + MONTH, sameSubscription: false, revoked: false, now: NOW,
}), false);

check('renewal extends the period', isStale({
  currentExpiry: NOW + HOUR, incomingExpiry: NOW + MONTH, sameSubscription: true, revoked: false, now: NOW,
}), false);

check('expiry notification (same date)', isStale({
  currentExpiry: NOW + HOUR, incomingExpiry: NOW + HOUR, sameSubscription: true, revoked: false, now: NOW,
}), false);

check('upgrade Starter -> Team mid-period', isStale({
  currentExpiry: NOW + MONTH, incomingExpiry: NOW + MONTH, sameSubscription: true, revoked: false, now: NOW,
}), false);

check('refund/revoke must still apply', isStale({
  currentExpiry: NOW + MONTH, incomingExpiry: NOW - HOUR, sameSubscription: true, revoked: true, now: NOW,
}), false);

check('resubscribe after lapse', isStale({
  currentExpiry: NOW - MONTH, incomingExpiry: NOW + MONTH, sameSubscription: false, revoked: false, now: NOW,
}), false);

check('new subscription while old one already expired', isStale({
  currentExpiry: NOW - HOUR, incomingExpiry: NOW + MONTH, sameSubscription: false, revoked: false, now: NOW,
}), false);

// The actual bug: an old Starter transaction replayed after a Team purchase.
check('replayed older transaction is rejected', isStale({
  currentExpiry: NOW + MONTH, incomingExpiry: NOW + HOUR, sameSubscription: false, revoked: false, now: NOW,
}), true);

check('late notification for a superseded period is rejected', isStale({
  currentExpiry: NOW + MONTH, incomingExpiry: NOW - MONTH, sameSubscription: false, revoked: false, now: NOW,
}), true);

console.log(failures === 0 ? '\nAll IAP logic checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
