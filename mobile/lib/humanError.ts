/**
 * Translate raw error strings into something a user can read.
 *
 * Supabase / fetch errors are noisy ("Network request failed", "TypeError: ..."
 * "JSON parse error"). This util returns a friendly, neutral message that
 * doesn't leak implementation details.
 *
 * Usage:
 *   try { ... } catch (e) {
 *     toast.show(humanError(e), { variant: 'error' });
 *   }
 *
 * For HTTP responses, prefer `humanErrorFromResponse(res, body)` which can
 * differentiate 4xx (use the server's message) from 5xx (generic friendly
 * message).
 */

const NETWORK_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i, // iOS Safari WKWebView
  /networkerror/i,
  /the network connection was lost/i,
  /typeerror.*fetch/i,
];

const SERVER_DEFAULT = "Something went wrong on our end. We're on it.";
const NETWORK_DEFAULT = "Couldn't reach the server. Try again in a sec.";
const FALLBACK = 'Something went wrong. Try again in a moment.';

export function humanError(err: unknown): string {
  if (err == null) return FALLBACK;
  // If we already have a clean string and it doesn't match a known noisy
  // pattern, pass it through.
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : (err as any)?.message
          ? String((err as any).message)
          : String(err);

  if (!raw) return FALLBACK;

  if (NETWORK_PATTERNS.some((p) => p.test(raw))) return NETWORK_DEFAULT;

  // Strip leading "TypeError: " / "Error: " / "Error " prefixes - they're
  // not useful to a user.
  const stripped = raw
    .replace(/^[A-Z][A-Za-z]*Error:\s*/, '')
    .replace(/^Error\s+/, '')
    .trim();

  if (NETWORK_PATTERNS.some((p) => p.test(stripped))) return NETWORK_DEFAULT;

  // Fallback if the message still looks like a stack/dev string.
  if (stripped.length > 240) return FALLBACK;
  if (/\bundefined\b/i.test(stripped) && /typeof/i.test(stripped))
    return FALLBACK;

  return stripped || FALLBACK;
}

/**
 * Given a fetch Response and its (already-read) body text, produce a
 * friendly message.
 *  - 5xx → generic server-error copy
 *  - 4xx → use the body's `error` / `message` field if present, else status
 *  - 2xx but called from a catch → fall back to humanError
 */
export function humanErrorFromResponse(
  res: Response | { status: number; ok?: boolean },
  bodyText?: string | null
): string {
  const status = res.status ?? 0;
  if (status >= 500) return SERVER_DEFAULT;

  // Try to parse the body as JSON for a useful field.
  if (bodyText) {
    try {
      const json = JSON.parse(bodyText);
      const msg = json?.error || json?.message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    } catch {
      // Not JSON - if it's short and human-y, show it directly.
      const trimmed = bodyText.trim();
      if (trimmed && trimmed.length < 200 && !trimmed.startsWith('<'))
        return trimmed;
    }
  }
  if (status >= 400) return `Request failed (HTTP ${status}).`;
  return FALLBACK;
}
