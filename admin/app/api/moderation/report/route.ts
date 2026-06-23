import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller } from '@/lib/bearerAuth';
import { sendEmail, escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST { reported_user_id?, search_id?, message_id?, kind, reason, details }
 * Files a content/abuse report. Required for App Store / Play Store UGC apps;
 * reports are emailed to support so they can be acted on within 24 hours.
 */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.user_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (!reason) return NextResponse.json({ error: 'Please choose a reason.' }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  const row = {
    reporter_id: me.user_id,
    reported_user_id: body.reported_user_id || null,
    search_id: body.search_id || null,
    message_id: body.message_id || null,
    firm_id: me.firm_id || null,
    kind: String(body.kind || 'other'),
    reason,
    details: String(body.details || '').slice(0, 2000) || null,
    status: 'open',
  };
  const { data, error } = await service
    .from('content_reports')
    .insert(row)
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify support so it can be reviewed within 24h (store requirement).
  try {
    await sendEmail({
      to: 'turnerlogan@parallelstudios.co',
      subject: `Content report (${row.kind}): ${reason}`,
      text:
        `A user filed a report.\n\nReason: ${reason}\nKind: ${row.kind}\n` +
        `Reporter: ${me.email || me.user_id}\nReported user: ${row.reported_user_id || '-'}\n` +
        `Deal: ${row.search_id || '-'}\nMessage: ${row.message_id || '-'}\n\nDetails:\n${row.details || '-'}`,
      html: `<p><strong>Content report</strong></p><ul>
        <li>Reason: ${escapeHtml(reason)}</li>
        <li>Kind: ${escapeHtml(row.kind)}</li>
        <li>Reporter: ${escapeHtml(me.email || me.user_id)}</li>
        <li>Reported user: ${escapeHtml(row.reported_user_id || '-')}</li>
        <li>Deal: ${escapeHtml(row.search_id || '-')}</li>
        </ul><p>${escapeHtml(row.details || '-')}</p>`,
    });
  } catch {}

  return NextResponse.json({ ok: true, id: (data as any)?.id });
}
