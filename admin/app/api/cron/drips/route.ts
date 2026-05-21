import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

/**
 * Scheduled cron — fires every day at 09:00 ET. Looks at
 * public.scheduled_messages for any rows whose scheduled_for has passed
 * and sent_at IS NULL, then dispatches via the right channel.
 *
 * Auth: the call needs to come from Vercel Cron, which sets
 *   Authorization: Bearer ${CRON_SECRET}
 * Drop the same value in your Vercel project env. Without it, we 401.
 *
 * Vercel cron config lives in vercel.json:
 *   { "crons": [{ "path": "/api/cron/drips", "schedule": "0 14 * * *" }] }
 * (14:00 UTC ≈ 09:00 ET. Bump as you like.)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get('authorization') || '';
    if (got !== 'Bearer ' + expected) {
      return NextResponse.json({ error: 'forbidden' }, { status: 401 });
    }
  }

  const service = getSupabaseServiceRoleClient();
  const now = new Date().toISOString();

  const { data: due } = await service
    .from('scheduled_messages')
    .select(
      `id, firm_id, search_id, recipient_user_id, recipient_email, channel,
       kind, subject, body,
       user:users!scheduled_messages_recipient_user_id_fkey ( email, phone, sms_opt_in, full_name ),
       firm:firms ( name )`
    )
    .lte('scheduled_for', now)
    .is('sent_at', null)
    .limit(200);

  const rows = (due as any[] | null) || [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of rows) {
    const email = m.recipient_email || m.user?.email;
    const fullName = m.user?.full_name || email;
    const firmName = m.firm?.name || 'Realtor Portal';
    let ok = false;
    try {
      if (m.channel === 'email' && email) {
        const r = await sendEmail({
          to: email,
          subject: m.subject || firmName + ' — a quick note',
          text: m.body,
          html:
            '<div style="font-family:system-ui;font-size:15px;max-width:560px;padding:20px">' +
            '<p>Hi ' +
            String(fullName || '').replace(/[<>]/g, '') +
            ',</p>' +
            '<p style="white-space:pre-wrap">' +
            String(m.body || '').replace(/[<>]/g, '') +
            '</p>' +
            '<p style="color:#64748B;font-size:12px;margin-top:32px">Sent via ' +
            firmName +
            ' on Realtor Portal.</p></div>',
        });
        ok = !!r;
      } else if (m.channel === 'sms') {
        const phone = m.user?.phone;
        if (!phone || !m.user?.sms_opt_in) {
          skipped++;
          continue;
        }
        const r = await sendSms({ to: phone, body: m.body });
        ok = r.ok;
      } else if (m.channel === 'in_app' && m.search_id && m.recipient_user_id) {
        // In-app channel routes through public.messages — the existing
        // realtor↔client thread surface picks it up immediately.
        const { error } = await service.from('messages').insert({
          firm_id: m.firm_id,
          search_id: m.search_id,
          sender_id: m.recipient_user_id, // delivered "from realtor portal"
          body: m.body,
        });
        ok = !error;
      } else {
        skipped++;
        continue;
      }
    } catch (err) {
      console.error('[cron/drips] dispatch failed', m.id, err);
    }

    if (ok) {
      sent++;
      await service
        .from('scheduled_messages')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', m.id);
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    considered: rows.length,
    sent,
    skipped,
    failed,
  });
}
