/**
 * Translate raw error strings into something a user can read.
 *
 * Supabase / fetch errors are noisy ("Network request failed", "TypeError: ..."
 * "JSON parse error"). This util returns a friendly, neutral message that
 * doesn't leak implementation details.
 *
 * Usage:
 *   try { ... } catch (e) { toast.show(humanError(e), { variant: 'error' }); }
 */

const NETWORK_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /networkerror/i,
  /the network connection was lost/i,
  /typeerror.*fetch/i,
];

const SERVER_DEFAULT = "Something went wrong on our end. We're on it.";
const NETWORK_DEFAULT = "Couldn't reach the server. Try again in a sec.";
const FALLBACK = 'Something went wrong. Try again in a moment.';

export function humanError(err: unknown): string {
  if (err == null) return FALLBACK;
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

  const stripped = raw
    .replace(/^[A-Z][A-Za-z]*Error:\s*/, '')
    .replace(/^Error\s+/, '')
    .trim();

  if (NETWORK_PATTERNS.some((p) => p.test(stripped))) return NETWORK_DEFAULT;
  if (stripped.length > 240) return FALLBACK;
  if (/\bundefined\b/i.test(stripped) && /typeof/i.test(stripped))
    return FALLBACK;

  return stripped || FALLBACK;
}

export function humanErrorFromResponse(
  res: Response | { status: number; ok?: boolean },
  bodyText?: string | null
): string {
  const status = res.status ?? 0;
  if (status >= 500) return SERVER_DEFAULT;

  if (bodyText) {
    try {
      const json = JSON.parse(bodyText);
      const msg = json?.error || json?.message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    } catch {
      const trimmed = bodyText.trim();
      if (trimmed && trimmed.length < 200 && !trimmed.startsWith('<'))
        return trimmed;
    }
  }
  if (status >= 400) return `Request failed (HTTP ${status}).`;
  return FALLBACK;
}
