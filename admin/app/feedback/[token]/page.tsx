import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { verifyFeedbackToken } from '@/lib/feedbackTokens';
import { FeedbackForm } from './FeedbackForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'How was the showing? · Realtor Portal' };

/**
 * /feedback/[token]?sid=<showingId>&em=<base64url(email)>  — PUBLIC, no login.
 *
 * URL scheme
 * ----------
 * The realtor mints one link per attendee:
 *   token = base64url(HMAC_SHA256(showingId + ':' + email, SECRET))
 *   url   = {SITE}/feedback/{token}?sid={showingId}&em={base64url(email)}
 *
 * The token lives in the path; the showing id + the attendee email travel as
 * query params so this page can render context (which house, who) and the
 * form can echo them back to the API. The API re-derives the HMAC from
 * (sid, em) and compares it to the token before accepting the write, so the
 * query params can't be tampered with without invalidating the token.
 *
 * We render the form unconditionally (so a stale link still shows the
 * property context) but pass `valid` down — the form disables submit and
 * shows a gentle "link expired" notice when the token doesn't check out.
 */
export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { sid?: string; em?: string };
}) {
  const token = params.token;
  const showingId = (searchParams.sid || '').trim();

  // Email is base64url-encoded in the URL to keep it tidy and avoid raw
  // addresses in link previews. Fall back to treating `em` as a plain
  // address if it isn't valid base64url.
  let email = '';
  if (searchParams.em) {
    try {
      email = Buffer.from(searchParams.em, 'base64url').toString('utf8');
    } catch {
      email = searchParams.em;
    }
  }
  email = email.trim().toLowerCase();

  const valid = Boolean(
    showingId && email && verifyFeedbackToken(showingId, email, token)
  );

  // Resolve context for the header (best-effort; never blocks rendering).
  let address: string | null = null;
  let firmName: string | null = null;
  let alreadySubmitted = false;

  if (valid) {
    const service = getSupabaseServiceRoleClient();
    const { data: showing } = await service
      .from('showings')
      .select(
        'id, firm_id, house_id, house:houses ( address ), firm:firms ( name )'
      )
      .eq('id', showingId)
      .maybeSingle();
    if (showing) {
      address = ((showing as any).house?.address as string) || null;
      firmName = ((showing as any).firm?.name as string) || null;
    }
    const { data: existing } = await service
      .from('showing_feedback')
      .select('id')
      .eq('showing_id', showingId)
      .ilike('author_email', email)
      .maybeSingle();
    alreadySubmitted = !!existing;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#0f172a',
        padding: '24px 16px',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <FeedbackForm
          valid={valid}
          showingId={showingId}
          email={email}
          token={token}
          address={address}
          firmName={firmName}
          alreadySubmitted={alreadySubmitted}
        />
      </div>
    </main>
  );
}
