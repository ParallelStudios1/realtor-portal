import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/sms-status
 *
 * Reports the Twilio toll-free verification state for the sending number -
 * the thing that decides whether US carriers will actually deliver our SMS.
 * Returns status strings only (no credentials, no PII).
 *
 * Auth: Authorization: Bearer <STATUS_CHECK_SECRET or CRON_SECRET>.
 * 401s when neither secret is configured.
 */
export async function GET(req: Request) {
  const expected =
    process.env.STATUS_CHECK_SECRET || process.env.CRON_SECRET || '';
  const got = req.headers.get('authorization') || '';
  if (!expected || got !== 'Bearer ' + expected) {
    return NextResponse.json({ error: 'forbidden' }, { status: 401 });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token) {
    return NextResponse.json({
      ok: false,
      error: 'Twilio env vars are not configured.',
      env: { sid_set: !!sid, token_set: !!token, from_set: !!from },
    });
  }

  const auth = Buffer.from(sid + ':' + token).toString('base64');
  try {
    const r = await fetch(
      'https://messaging.twilio.com/v1/Tollfree/Verifications?PageSize=20',
      { headers: { Authorization: 'Basic ' + auth }, cache: 'no-store' }
    );
    const j = (await r.json()) as any;
    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: 'Twilio API error ' + r.status,
        detail: j?.message || null,
      });
    }
    const verifications = ((j?.verifications as any[]) || []).map((v) => ({
      status: v.status,
      rejection_reason: v.rejection_reason || null,
      date_created: v.date_created,
      date_updated: v.date_updated,
    }));
    return NextResponse.json({
      ok: true,
      from_number_set: !!from,
      verifications,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message || 'Twilio request failed.',
    });
  }
}
