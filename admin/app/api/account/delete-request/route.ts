import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PUBLIC (no auth) account + data deletion request, for the URL we link from
 * the App Store / Play Store listings. Records the request and emails support
 * so it can be actioned. (Signed-in users can delete instantly in-app; this is
 * the request path for the store-required public link.)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const details = String(body.details || '').slice(0, 2000);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });

  const service = getSupabaseServiceRoleClient();
  // Record it (service role, since the requester isn't signed in).
  try {
    await service.from('content_reports').insert({
      kind: 'account_deletion_request',
      reason: 'Account & data deletion request',
      details: `Email: ${email}\n\n${details}`,
      status: 'open',
    });
  } catch {
    /* best-effort record; the email below is the source of truth */
  }

  try {
    await sendEmail({
      to: 'turnerlogan@parallelstudios.co',
      subject: 'Account & data deletion request',
      text: `Deletion request from ${email}\n\nDetails:\n${details || '-'}`,
      html: `<p><strong>Account &amp; data deletion request</strong></p><p>From: ${escapeHtml(
        email
      )}</p><p>${escapeHtml(details || '-')}</p>`,
    });
  } catch {}

  return NextResponse.json({ ok: true });
}
