import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { buildTourIcsAttachment, resolveTourStart } from '@/lib/ics';

export const runtime = 'nodejs';

/**
 * POST /api/notifications/send-email
 *
 * Body: {
 *   kind: 'tour_confirmed' | 'tour_declined' | 'message_digest',
 *   searchId: string,
 *   tourRequestId?: string,   // required for tour_confirmed / tour_declined
 *   messageId?: string,       // optional preview source for message_digest
 *   messagePreview?: string,  // explicit preview override
 * }
 *
 * Auth: cookie session (web) or Authorization: Bearer (mobile) — same shape
 * as /api/clients/invite and /api/notifications/send-push.
 *
 * Always returns JSON. If RESEND_API_KEY isn't set, sendEmail() returns
 * skipped:true and we surface that as { ok: true, sent: 0, skipped: true }.
 *
 * Tenant scoping: we look up the search via the service-role client and
 * reject if the caller's firm doesn't match.
 */
type Input = {
  kind?: 'tour_confirmed' | 'tour_declined' | 'message_digest';
  searchId?: string;
  tourRequestId?: string;
  messageId?: string;
  messagePreview?: string;
};

async function resolveCaller(req: Request) {
  const me = await getMe();
  if (me?.user_id) return { id: me.user_id, firm_id: me.firm_id };
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false },
    }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await sb
    .from('users')
    .select('firm_id')
    .eq('id', data.user.id)
    .single();
  return {
    id: data.user.id,
    firm_id: (row?.firm_id as string) || null,
  };
}

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

function formatWhen(preferred: string | null | undefined, start: Date): string {
  // If the realtor wrote a freeform "Saturday afternoon" we trust it. If it
  // already parses as a date, format the parsed Date for nicer copy.
  if (preferred) {
    const tryDate = new Date(preferred);
    if (!isNaN(tryDate.getTime())) {
      return tryDate.toLocaleString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return preferred;
  }
  return start.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const PORTAL_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://realtor-portal-ten.vercel.app';

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.firm_id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const input = (await req.json().catch(() => ({}))) as Input;
    if (!input.kind || !input.searchId) {
      return NextResponse.json(
        { error: 'kind and searchId are required.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();

    // Resolve the search → client + realtor + firm. Reject cross-firm sends.
    const { data: search, error: searchErr } = await service
      .from('client_searches')
      .select('id, client_id, realtor_id, firm_id, name')
      .eq('id', input.searchId)
      .single();
    if (searchErr || !search) {
      return NextResponse.json({ error: 'Search not found.' }, { status: 404 });
    }
    if (search.firm_id !== me.firm_id) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Pull the people + firm so we can render templates.
    const [{ data: client }, { data: realtor }, { data: firm }] =
      await Promise.all([
        service
          .from('users')
          .select('id, full_name, email')
          .eq('id', search.client_id)
          .single(),
        service
          .from('users')
          .select('id, full_name, email')
          .eq('id', search.realtor_id)
          .single(),
        service
          .from('firms')
          .select('id, name, contact_email')
          .eq('id', search.firm_id)
          .single(),
      ]);

    if (!client?.email) {
      return NextResponse.json(
        { ok: false, error: 'Client has no email on file.' },
        { status: 400 }
      );
    }

    const clientFirst = firstName(client.full_name);
    const realtorName = realtor?.full_name || 'Your agent';
    const firmName = firm?.name || 'Realtor Portal';
    const replyTo = realtor?.email || firm?.contact_email || undefined;

    if (input.kind === 'tour_confirmed' || input.kind === 'tour_declined') {
      if (!input.tourRequestId) {
        return NextResponse.json(
          { error: 'tourRequestId required for tour_* kinds.' },
          { status: 400 }
        );
      }
      const { data: tour, error: tourErr } = await service
        .from('tour_requests')
        .select('id, firm_id, search_id, house_id, preferred_when, notes')
        .eq('id', input.tourRequestId)
        .single();
      if (tourErr || !tour) {
        return NextResponse.json(
          { error: 'Tour request not found.' },
          { status: 404 }
        );
      }
      if (tour.firm_id !== me.firm_id || tour.search_id !== search.id) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      }

      const { data: house } = await service
        .from('houses')
        .select('id, address')
        .eq('id', tour.house_id)
        .single();

      const address = house?.address || 'the property';
      const start = resolveTourStart(tour.preferred_when);
      const whenText = formatWhen(tour.preferred_when, start);

      if (input.kind === 'tour_confirmed') {
        const subject = `Tour confirmed: ${address}`;
        const notesBlock = tour.notes
          ? `<p style="margin:0 0 16px;color:#475569;">Notes from your agent: ${escapeHtml(
              tour.notes
            )}</p>`
          : '';
        const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">Hey ${escapeHtml(clientFirst)},</p>
  <p style="margin:0 0 16px;">${escapeHtml(realtorName)} confirmed your tour at <strong>${escapeHtml(
          address
        )}</strong> for <strong>${escapeHtml(
          whenText
        )}</strong>. We've attached a calendar invite — tap to add it to your calendar.</p>
  ${notesBlock}
  <p style="margin:24px 0 0;color:#475569;">— ${escapeHtml(firmName)}</p>
</div>`.trim();
        const text = [
          `Hey ${clientFirst},`,
          '',
          `${realtorName} confirmed your tour at ${address} for ${whenText}. We've attached a calendar invite — tap to add it to your calendar.`,
          tour.notes ? `\nNotes from your agent: ${tour.notes}` : '',
          '',
          `— ${firmName}`,
        ]
          .filter(Boolean)
          .join('\n');

        const ics = buildTourIcsAttachment({
          uid: `tour-${tour.id}@realtor-portal-ten.vercel.app`,
          summary: `Tour: ${address}`,
          description: tour.notes || `Tour with ${realtorName}`,
          location: address,
          start,
          durationMinutes: 60,
          organizerEmail: realtor?.email || firm?.contact_email || undefined,
          organizerName: realtorName,
          attendeeEmail: client.email,
          attendeeName: client.full_name || undefined,
        });

        const result = await sendEmail({
          to: client.email,
          subject,
          html,
          text,
          attachments: [ics],
          replyTo,
        });
        return NextResponse.json({
          ok: result.ok,
          sent: result.ok ? 1 : 0,
          skipped: 'skipped' in result ? result.skipped : false,
          id: 'id' in result ? result.id : null,
          error: 'error' in result ? result.error : undefined,
        });
      }

      // tour_declined
      const subject = `Tour update for ${address}`;
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">Hi ${escapeHtml(clientFirst)},</p>
  <p style="margin:0 0 16px;">Quick update — ${escapeHtml(
    realtorName
  )} can't make <strong>${escapeHtml(whenText)}</strong> for <strong>${escapeHtml(
        address
      )}</strong>. They'll reach out with a few alternative times shortly.</p>
  <p style="margin:24px 0 0;color:#475569;">— ${escapeHtml(firmName)}</p>
</div>`.trim();
      const text = [
        `Hi ${clientFirst},`,
        '',
        `Quick update — ${realtorName} can't make ${whenText} for ${address}. They'll reach out with a few alternative times shortly.`,
        '',
        `— ${firmName}`,
      ].join('\n');

      const result = await sendEmail({
        to: client.email,
        subject,
        html,
        text,
        replyTo,
      });
      return NextResponse.json({
        ok: result.ok,
        sent: result.ok ? 1 : 0,
        skipped: 'skipped' in result ? result.skipped : false,
        id: 'id' in result ? result.id : null,
        error: 'error' in result ? result.error : undefined,
      });
    }

    if (input.kind === 'message_digest') {
      // v1: not actually a digest — just "you have a new message". Pulls a
      // preview from input.messagePreview > messages.body > generic copy.
      let preview = input.messagePreview?.trim() || '';
      if (!preview && input.messageId) {
        const { data: msg } = await service
          .from('messages')
          .select('body')
          .eq('id', input.messageId)
          .single();
        if (msg?.body) preview = msg.body;
      }
      preview = (preview || 'You have a new message from your agent.').slice(
        0,
        240
      );

      // Recipient: in v1 we only email the client, mirroring tour_*. The
      // realtor sees in-app + push.
      const subject = `New message from ${realtorName}`;
      const portalLink = PORTAL_URL;
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">Hi ${escapeHtml(clientFirst)},</p>
  <p style="margin:0 0 16px;">${escapeHtml(
    realtorName
  )} sent you a new message:</p>
  <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #cbd5e1;color:#334155;background:#f8fafc;">${escapeHtml(
    preview
  )}</blockquote>
  <p style="margin:0 0 16px;"><a href="${escapeHtml(
    portalLink
  )}" style="color:#1f6feb;">Open the portal</a> to reply.</p>
  <p style="margin:24px 0 0;color:#475569;">— ${escapeHtml(firmName)}</p>
</div>`.trim();
      const text = [
        `Hi ${clientFirst},`,
        '',
        `${realtorName} sent you a new message:`,
        '',
        `"${preview}"`,
        '',
        `Open the portal to reply: ${portalLink}`,
        '',
        `— ${firmName}`,
      ].join('\n');

      const result = await sendEmail({
        to: client.email,
        subject,
        html,
        text,
        replyTo,
      });
      return NextResponse.json({
        ok: result.ok,
        sent: result.ok ? 1 : 0,
        skipped: 'skipped' in result ? result.skipped : false,
        id: 'id' in result ? result.id : null,
        error: 'error' in result ? result.error : undefined,
      });
    }

    return NextResponse.json(
      { error: `Unknown kind: ${input.kind}` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[notifications/send-email] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
