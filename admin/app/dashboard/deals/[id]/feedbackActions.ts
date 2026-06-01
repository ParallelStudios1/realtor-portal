'use server';

import { revalidatePath } from 'next/cache';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { logAudit } from '@/lib/audit';
import { mintFeedbackToken } from '@/lib/feedbackTokens';

/**
 * Server actions for the showing-feedback loop (Feature 2).
 *
 *   - requestShowingFeedbackAction: an agent (in-app, firm-scoped) stamps
 *     feedback_requested_at on a showing, mints a per-attendee HMAC token, and
 *     emails each attendee + the principal client a "How was the showing?"
 *     link to the public /feedback/[token] form.
 *
 *   - submitShowingFeedbackAction: an in-app principal (client or staff)
 *     submits/updates feedback directly without needing a token — same upsert
 *     the public API does, but authenticated and firm-scoped.
 *
 * These live in their own file (not the shared deals/[id]/actions.ts) so the
 * feature stays self-contained. Conventions mirror that file: getMe +
 * firm-scope guard, an `activities` timeline row, logAudit, revalidatePath.
 */

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://realtor-portal-ten.vercel.app';

const INTERESTS = ['not_interested', 'maybe', 'interested', 'offer_likely'];
const PRICE_OPINIONS = ['overpriced', 'about_right', 'underpriced'];

/**
 * Resolve the caller and confirm they can act on the given showing. Returns
 * the showing row (with denormalized firm/search/house) on success. Runs the
 * showing lookup under the caller's auth so RLS — including the cross-firm
 * collaborator path — applies, then re-reads denormalized fields via service
 * role for the writes.
 */
async function authorizeShowing(showingId: string) {
  const me = await getMe();
  if (!me?.firm_id) return { error: 'Not authenticated.' as const };
  if (
    me.role !== 'realtor' &&
    me.role !== 'firm_admin' &&
    me.role !== 'super_admin' &&
    me.role !== 'owner' &&
    me.role !== 'manager' &&
    me.role !== 'agent'
  )
    return { error: 'Forbidden.' as const };

  // RLS-scoped visibility check (covers cross-firm collaborators).
  const supabase = getSupabaseServerClient();
  const { data: visible } = await supabase
    .from('showings')
    .select('id')
    .eq('id', showingId)
    .maybeSingle();
  if (!visible) return { error: 'Showing not found.' as const };

  const service = getSupabaseServiceRoleClient();
  const { data: showing } = await service
    .from('showings')
    .select(
      'id, firm_id, search_id, house_id, scheduled_at, attendees, feedback_requested_at, house:houses ( address )'
    )
    .eq('id', showingId)
    .maybeSingle();
  if (!showing) return { error: 'Showing not found.' as const };

  return { me, showing: showing as any };
}

async function activity(
  searchId: string,
  firmId: string,
  actorId: string,
  action: string,
  target: string,
  metadata?: any
) {
  const service = getSupabaseServiceRoleClient();
  await service.from('activities').insert({
    firm_id: firmId,
    search_id: searchId,
    actor_id: actorId,
    action,
    target,
    metadata: metadata ?? null,
  });
}

/** Build the public feedback URL for one attendee. Null if no secret is set. */
function feedbackUrl(showingId: string, email: string): string | null {
  const token = mintFeedbackToken(showingId, email);
  if (!token) return null;
  const em = Buffer.from(email.trim().toLowerCase(), 'utf8').toString(
    'base64url'
  );
  return (
    SITE_URL.replace(/\/$/, '') +
    '/feedback/' +
    token +
    '?sid=' +
    encodeURIComponent(showingId) +
    '&em=' +
    em
  );
}

/**
 * Agent action: request feedback for a showing. Stamps feedback_requested_at,
 * then emails every attendee + the principal client a personal feedback link.
 */
export async function requestShowingFeedbackAction(
  clientId: string,
  showingId: string
) {
  const a = await authorizeShowing(showingId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const { me, showing } = a;
  const service = getSupabaseServiceRoleClient();

  if (!mintFeedbackToken(showingId, 'probe@example.com')) {
    return {
      ok: false as const,
      error:
        'Feedback links are not configured. Set FEEDBACK_TOKEN_SECRET (or CALENDAR_FEED_SECRET) and try again.',
    };
  }

  // Build the recipient set: showing attendees (name/email/phone JSON) + the
  // principal client on the deal. Dedupe by lower(email).
  const recipients: { name: string | null; email: string }[] = [];
  const seen = new Set<string>();
  const pushRecipient = (name: string | null, email: string | null) => {
    const e = (email || '').trim().toLowerCase();
    if (!e || seen.has(e)) return;
    seen.add(e);
    recipients.push({ name: name?.trim() || null, email: e });
  };

  for (const att of (Array.isArray(showing.attendees)
    ? showing.attendees
    : []) as any[]) {
    pushRecipient(att?.name ?? null, att?.email ?? null);
  }

  // Principal client on the deal.
  const { data: deal } = await service
    .from('client_searches')
    .select(
      'id, firm_id, name, client:users!client_searches_client_id_fkey ( full_name, email ), realtor:users!client_searches_realtor_id_fkey ( full_name, email )'
    )
    .eq('id', showing.search_id)
    .maybeSingle();
  if (deal) {
    const client = (deal as any).client;
    if (client?.email) pushRecipient(client.full_name, client.email);
  }

  if (recipients.length === 0) {
    return {
      ok: false as const,
      error:
        'No one to ask — add an attendee email to the showing or a client to the deal first.',
    };
  }

  // Stamp the request time.
  const { error: stampErr } = await service
    .from('showings')
    .update({ feedback_requested_at: new Date().toISOString() })
    .eq('id', showingId);
  if (stampErr) return { ok: false as const, error: stampErr.message };

  const address = showing.house?.address || 'the property';
  const realtorName =
    (deal as any)?.realtor?.full_name ||
    (deal as any)?.realtor?.email ||
    me.full_name ||
    'Your agent';
  const replyTo = (deal as any)?.realtor?.email || undefined;

  let sent = 0;
  for (const r of recipients) {
    const url = feedbackUrl(showingId, r.email);
    if (!url) continue;
    const greeting = r.name ? `Hi ${r.name},` : 'Hi there,';
    const subject = `How was the showing at ${address}?`;
    const html = `
<div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 16px;">${escapeHtml(
    realtorName
  )} would love your quick take on the showing at <strong>${escapeHtml(
      address
    )}</strong>. It takes about 30 seconds and helps guide what to look at next.</p>
  <p style="margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:11px 18px;border-radius:10px;font-weight:600;text-decoration:none;">Share your feedback &rarr;</a>
  </p>
  <p style="margin:0;color:#64748b;font-size:13px;">If the button doesn&rsquo;t work, paste this link into your browser:<br>${url}</p>
</div>`.trim();
    const text = [
      greeting,
      '',
      `${realtorName} would love your quick take on the showing at ${address}. It takes about 30 seconds.`,
      '',
      `Share your feedback: ${url}`,
    ].join('\n');

    try {
      const res = await sendEmail({ to: r.email, subject, html, text, replyTo });
      if ((res as any).ok) sent++;
    } catch (e: any) {
      console.error(
        '[requestShowingFeedbackAction] sendEmail failed',
        e?.message || e
      );
    }
  }

  await activity(
    showing.search_id,
    showing.firm_id,
    me.user_id,
    'showing_feedback_requested',
    address,
    { showing_id: showingId, recipients: recipients.length, emails_sent: sent }
  );

  await logAudit({
    firmId: showing.firm_id,
    searchId: showing.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'showing_feedback_requested',
    entityType: 'showing',
    entityId: showingId,
    summary: `Requested feedback from ${recipients.length} attendee(s) for ${address}`,
    metadata: { recipients: recipients.length, emails_sent: sent },
  });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + showing.search_id);
  return { ok: true as const, recipients: recipients.length, sent };
}

/**
 * In-app feedback submission by an authenticated principal (the client or a
 * staff member capturing verbal feedback). Upserts on (showing, email) just
 * like the public API, but trusts the session instead of a token.
 */
export async function submitShowingFeedbackAction(
  clientId: string,
  payload: {
    showing_id: string;
    author_email: string;
    author_name?: string | null;
    stars: number;
    interest: string;
    price_opinion?: string | null;
    liked?: string | null;
    concerns?: string | null;
    share_with_seller?: boolean;
  }
) {
  const a = await authorizeShowing(payload.showing_id);
  if ('error' in a) return { ok: false as const, error: a.error };
  const { me, showing } = a;

  const email = (payload.author_email || '').trim().toLowerCase();
  if (!email) return { ok: false as const, error: 'Author email is required.' };
  if (
    !Number.isInteger(payload.stars) ||
    payload.stars < 1 ||
    payload.stars > 5
  )
    return { ok: false as const, error: 'Stars must be 1 to 5.' };
  if (!INTERESTS.includes(payload.interest))
    return { ok: false as const, error: 'Invalid interest.' };
  if (payload.price_opinion && !PRICE_OPINIONS.includes(payload.price_opinion))
    return { ok: false as const, error: 'Invalid price opinion.' };

  const service = getSupabaseServiceRoleClient();
  const { error } = await service.from('showing_feedback').upsert(
    {
      firm_id: showing.firm_id,
      showing_id: showing.id,
      search_id: showing.search_id,
      house_id: showing.house_id,
      author_user_id: me.user_id,
      author_name: payload.author_name?.trim() || null,
      author_email: email,
      stars: payload.stars,
      interest: payload.interest,
      price_opinion: payload.price_opinion || null,
      liked: payload.liked?.trim() || null,
      concerns: payload.concerns?.trim() || null,
      share_with_seller:
        payload.share_with_seller === undefined
          ? true
          : Boolean(payload.share_with_seller),
    },
    { onConflict: 'showing_id,author_email' }
  );
  if (error) return { ok: false as const, error: error.message };

  await activity(
    showing.search_id,
    showing.firm_id,
    me.user_id,
    'showing_feedback_submitted',
    showing.house?.address || showing.id,
    { showing_id: showing.id, stars: payload.stars, interest: payload.interest }
  );

  await logAudit({
    firmId: showing.firm_id,
    searchId: showing.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'showing_feedback_submitted',
    entityType: 'showing',
    entityId: showing.id,
    summary: `Feedback recorded for ${showing.house?.address || 'a showing'}`,
    metadata: { stars: payload.stars, interest: payload.interest },
  });

  revalidatePath(`/dashboard/clients/${clientId}`);
  revalidatePath('/dashboard/deals/' + showing.search_id);
  return { ok: true as const };
}

/**
 * Read all feedback for a showing — used by the in-app display under each
 * showing in the deal workspace. Firm-scoped via the caller's RLS visibility
 * of the showing.
 */
export async function getShowingFeedbackAction(showingId: string) {
  const a = await authorizeShowing(showingId);
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const { data, error } = await service
    .from('showing_feedback')
    .select(
      'id, author_name, author_email, stars, interest, price_opinion, liked, concerns, share_with_seller, created_at'
    )
    .eq('showing_id', showingId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, feedback: (data || []) as any[] };
}
