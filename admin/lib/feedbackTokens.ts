/**
 * Single-purpose HMAC tokens that gate the public showing-feedback form.
 *
 * Mirrors the stateless-token approach in lib/ics.ts (computeCalendarFeedToken /
 * buildCalendarFeedUrl): we never store a token row - we derive an unguessable
 * value from (showingId + email) under a server-only secret. The public
 * feedback form carries the token in its URL, and the API route re-derives and
 * compares it before accepting a write. Revocation = rotate the secret.
 *
 *   token = base64url(HMAC_SHA256(showingId + ':' + email, SECRET))
 *
 * Secret resolution:
 *   1. FEEDBACK_TOKEN_SECRET  (preferred - scopes this feature on its own key)
 *   2. CALENDAR_FEED_SECRET   (fallback - reuse the existing stateless secret)
 *   3. neither set            → minting returns null, verification returns false
 *
 * Scoping the token to BOTH the showing and the attendee's email means a token
 * minted for one attendee can't be replayed to submit feedback as another, and
 * a token for one showing can't be used on a different showing.
 */

function getSecret(): string | null {
  return (
    process.env.FEEDBACK_TOKEN_SECRET ||
    process.env.CALENDAR_FEED_SECRET ||
    null
  );
}

/** Normalize the email so minting and verification agree on casing/whitespace. */
function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

function compute(showingId: string, email: string, secret: string): string {
  // Lazy require keeps this module importable from any runtime that doesn't
  // touch the token path.
  const { createHmac } = require('crypto') as typeof import('crypto');
  return createHmac('sha256', secret)
    .update(showingId + ':' + normalizeEmail(email))
    .digest('base64url');
}

/**
 * Mint a feedback token for a given showing + attendee email.
 * Returns null when no secret is configured.
 */
export function mintFeedbackToken(
  showingId: string,
  email: string
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  if (!showingId || !email) return null;
  return compute(showingId, email, secret);
}

/**
 * Verify a token against a showing + email. Returns false when no secret is
 * configured, when inputs are missing, or on any mismatch. Uses a
 * constant-time comparison so we don't leak timing about how much of the
 * token matched.
 */
export function verifyFeedbackToken(
  showingId: string,
  email: string,
  token: string
): boolean {
  const secret = getSecret();
  if (!secret) return false;
  if (!showingId || !email || !token) return false;
  const expected = compute(showingId, email, secret);
  try {
    const { timingSafeEqual } = require('crypto') as typeof import('crypto');
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
