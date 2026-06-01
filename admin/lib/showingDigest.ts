/**
 * Seller-facing showing-feedback digest (Feature 2).
 *
 * `runShowingDigestCron` is meant to be called once a day from
 * /api/cron/daily (the cron route itself is wired up separately). For every
 * seller-side deal (client_searches.kind in ('seller','both')) it finds
 * showings that have shareable feedback the seller hasn't seen yet, groups the
 * feedback by deal + house, emails the seller (principal client) + the listing
 * agent a clean summary, then stamps showings.feedback_digest_sent_at so the
 * same feedback isn't re-sent tomorrow.
 *
 * "Hasn't seen yet" = the showing's feedback_digest_sent_at is null, OR there
 * is shareable feedback created strictly after that timestamp. Stamping happens
 * per showing once its current shareable feedback has been included.
 */
import { getSupabaseServiceRoleClient } from './supabaseServer';
import { sendEmail, escapeHtml } from './email';

type SupabaseService = ReturnType<typeof getSupabaseServiceRoleClient>;

const INTEREST_LABELS: Record<string, string> = {
  not_interested: 'Not interested',
  maybe: 'Maybe',
  interested: 'Interested',
  offer_likely: 'Likely to offer',
};

const PRICE_LABELS: Record<string, string> = {
  overpriced: 'Felt overpriced',
  about_right: 'Price about right',
  underpriced: 'Felt underpriced',
};

export type DigestFeedbackRow = {
  stars: number | null;
  interest: string | null;
  price_opinion: string | null;
  liked: string | null;
  concerns: string | null;
  created_at: string | null;
  house_address?: string | null;
};

function stars(n: number | null | undefined): string {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
}

function avg(rows: { stars: number | null }[]): number | null {
  const vals = rows
    .map((r) => Number(r.stars))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * Render the seller digest body (HTML + text) from a flat list of shareable
 * feedback rows, grouped by house address. Exported so it can be reused/tested
 * independently of the cron.
 */
export function renderShowingDigest(args: {
  dealName: string | null;
  rows: DigestFeedbackRow[];
}): { html: string; text: string; subject: string } {
  const { rows } = args;
  const dealName = args.dealName || 'your listing';

  // Group by house address.
  const groups = new Map<string, DigestFeedbackRow[]>();
  for (const r of rows) {
    const key = r.house_address || 'Your listing';
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  }

  const overall = avg(rows);
  const count = rows.length;
  const subject = `Showing feedback summary: ${count} new ${
    count === 1 ? 'note' : 'notes'
  }`;

  const htmlParts: string[] = [];
  const textParts: string[] = [];

  htmlParts.push(
    `<div style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">`
  );
  htmlParts.push(
    `<p style="margin:0 0 8px;">Here&rsquo;s a summary of recent showing feedback on <strong>${escapeHtml(
      dealName
    )}</strong>.</p>`
  );
  if (overall != null) {
    htmlParts.push(
      `<p style="margin:0 0 20px;color:#334155;">Average rating: <strong>${overall} / 5</strong> across ${count} ${
        count === 1 ? 'response' : 'responses'
      }.</p>`
    );
  }

  textParts.push(`Showing feedback summary for ${dealName}`);
  if (overall != null) {
    textParts.push(
      `Average rating: ${overall} / 5 across ${count} ${
        count === 1 ? 'response' : 'responses'
      }.`
    );
  }
  textParts.push('');

  for (const [address, items] of groups) {
    htmlParts.push(
      `<h3 style="font-size:15px;margin:20px 0 8px;color:#0f172a;">${escapeHtml(
        address
      )}</h3>`
    );
    textParts.push(`== ${address} ==`);
    for (const r of items) {
      const bits: string[] = [];
      if (r.interest && INTEREST_LABELS[r.interest])
        bits.push(INTEREST_LABELS[r.interest]);
      if (r.price_opinion && PRICE_LABELS[r.price_opinion])
        bits.push(PRICE_LABELS[r.price_opinion]);

      htmlParts.push(
        `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin:0 0 10px;">`
      );
      htmlParts.push(
        `<div style="font-size:14px;color:#f59e0b;">${stars(r.stars)} <span style="color:#64748b;">${bits
          .map((b) => escapeHtml(b))
          .join(' · ')}</span></div>`
      );
      if (r.liked)
        htmlParts.push(
          `<p style="margin:8px 0 0;font-size:14px;"><strong>Liked:</strong> ${escapeHtml(
            r.liked
          )}</p>`
        );
      if (r.concerns)
        htmlParts.push(
          `<p style="margin:6px 0 0;font-size:14px;"><strong>Concerns:</strong> ${escapeHtml(
            r.concerns
          )}</p>`
        );
      htmlParts.push(`</div>`);

      const line = [
        stars(r.stars),
        bits.length ? '(' + bits.join(', ') + ')' : '',
      ]
        .filter(Boolean)
        .join(' ');
      textParts.push('- ' + line);
      if (r.liked) textParts.push('  Liked: ' + r.liked);
      if (r.concerns) textParts.push('  Concerns: ' + r.concerns);
    }
    textParts.push('');
  }

  htmlParts.push(
    `<p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">Feedback is shared anonymously to protect buyer privacy.</p>`
  );
  htmlParts.push(`</div>`);
  textParts.push('Feedback is shared anonymously to protect buyer privacy.');

  return {
    html: htmlParts.join('\n'),
    text: textParts.join('\n'),
    subject,
  };
}

/**
 * Daily cron entry point. Call from /api/cron/daily with the service-role
 * client. Returns { digestsSent }.
 */
export async function runShowingDigestCron(
  service: SupabaseService
): Promise<{ digestsSent: number }> {
  // 1. Pull all shareable feedback joined to its showing so we can decide
  //    per-showing whether it's new since the last digest.
  const { data: feedbackRows } = await service
    .from('showing_feedback')
    .select(
      `id, search_id, showing_id, stars, interest, price_opinion, liked, concerns, created_at, share_with_seller,
       house:houses ( address ),
       showing:showings ( id, feedback_digest_sent_at )`
    )
    .eq('share_with_seller', true)
    .order('created_at', { ascending: true })
    .limit(2000);

  const rows = (feedbackRows as any[] | null) || [];
  if (rows.length === 0) return { digestsSent: 0 };

  // 2. Keep only feedback that is newer than its showing's last digest stamp.
  type Pending = {
    searchId: string;
    showingId: string;
    address: string | null;
    feedback: DigestFeedbackRow;
  };
  const pending: Pending[] = [];
  for (const r of rows) {
    const sentAt = r.showing?.feedback_digest_sent_at
      ? new Date(r.showing.feedback_digest_sent_at).getTime()
      : 0;
    const createdAt = r.created_at ? new Date(r.created_at).getTime() : 0;
    if (sentAt && createdAt && createdAt <= sentAt) continue; // already covered
    pending.push({
      searchId: r.search_id,
      showingId: r.showing_id,
      address: r.house?.address ?? null,
      feedback: {
        stars: r.stars,
        interest: r.interest,
        price_opinion: r.price_opinion,
        liked: r.liked,
        concerns: r.concerns,
        created_at: r.created_at,
        house_address: r.house?.address ?? null,
      },
    });
  }
  if (pending.length === 0) return { digestsSent: 0 };

  // 3. Group pending feedback by deal.
  const byDeal = new Map<string, Pending[]>();
  for (const p of pending) {
    const arr = byDeal.get(p.searchId) || [];
    arr.push(p);
    byDeal.set(p.searchId, arr);
  }

  let digestsSent = 0;

  for (const [searchId, items] of byDeal) {
    // 4. Confirm this is a seller-side deal and resolve recipients.
    const { data: deal } = await service
      .from('client_searches')
      .select(
        `id, firm_id, kind, name,
         client:users!client_searches_client_id_fkey ( full_name, email ),
         realtor:users!client_searches_realtor_id_fkey ( full_name, email )`
      )
      .eq('id', searchId)
      .maybeSingle();
    if (!deal) continue;
    const kind = (deal as any).kind;
    if (kind !== 'seller' && kind !== 'both') continue;

    const sellerEmail = (deal as any).client?.email as string | undefined;
    const agentEmail = (deal as any).realtor?.email as string | undefined;
    const to: string[] = [];
    if (sellerEmail) to.push(sellerEmail);
    if (agentEmail && agentEmail !== sellerEmail) to.push(agentEmail);
    if (to.length === 0) continue;

    // 5. Render + send.
    const { html, text, subject } = renderShowingDigest({
      dealName: (deal as any).name || null,
      rows: items.map((i) => i.feedback),
    });

    let ok = false;
    try {
      const res = await sendEmail({
        to,
        subject,
        html,
        text,
        replyTo: agentEmail,
      });
      ok = Boolean((res as any).ok);
    } catch (e: any) {
      console.error('[runShowingDigestCron] sendEmail failed', e?.message || e);
    }

    // 6. Stamp every covered showing so this feedback isn't re-sent. We stamp
    //    even if the email provider is unconfigured (skipped) only when the
    //    send actually succeeded — otherwise we'd silently drop the digest.
    if (ok) {
      digestsSent++;
      const showingIds = Array.from(new Set(items.map((i) => i.showingId)));
      const stampedAt = new Date().toISOString();
      await service
        .from('showings')
        .update({ feedback_digest_sent_at: stampedAt })
        .in('id', showingIds);
    }
  }

  return { digestsSent };
}
