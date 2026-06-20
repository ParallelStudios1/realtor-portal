import { NextResponse } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { sendSms, normalizeUsPhone } from '@/lib/sms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/debug/test-sms { phone: string }
 *
 * Force-fire a Twilio SMS to a phone of the caller's choosing. Returns
 * the full Twilio response so the user can see EXACTLY why it failed
 * (invalid number, geographic-permissions, etc.). Useful for proving
 * the wiring is live before doing real invites.
 *
 * Only staff users in a firm can hit this - clients shouldn't be able
 * to spam phones via our Twilio number.
 */
export async function POST(req: Request) {
  const me = await getMe();
  if (!me?.firm_id) {
    return NextResponse.json(
      { ok: false, error: 'Not signed in.' },
      { status: 401 }
    );
  }
  const staff =
    me.role === 'realtor' ||
    me.role === 'firm_admin' ||
    me.role === 'super_admin' ||
    me.role === 'owner' ||
    me.role === 'manager';
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: 'Forbidden.' },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const raw = (body.phone || '').trim();
  if (!raw) {
    return NextResponse.json(
      { ok: false, error: 'phone is required.' },
      { status: 400 }
    );
  }
  const e164 = normalizeUsPhone(raw);
  if (!e164) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Could not normalize that number to E.164. Use a US number.',
      },
      { status: 400 }
    );
  }

  const r = await sendSms({
    to: e164,
    body:
      'Realtor Portal test - wiring works. From: ' +
      (me.full_name || me.email || 'your firm') +
      '.',
  });

  // Twilio's REST returns "queued" instantly even when the carrier later
  // drops the message (most common reason: US A2P 10DLC - the sending
  // number isn't registered with The Campaign Registry, so every US
  // carrier rejects it with error_code 30034). Wait a couple seconds and
  // ask Twilio for the actual delivery status + error code so we surface
  // the real reason in the diagnostic, not just "queued".
  let twilioStatus: any = null;
  if (r.ok && r.sid) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 3500));
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const token = process.env.TWILIO_AUTH_TOKEN!;
      const auth = Buffer.from(sid + ':' + token).toString('base64');
      const sr = await fetch(
        'https://api.twilio.com/2010-04-01/Accounts/' +
          encodeURIComponent(sid) +
          '/Messages/' +
          encodeURIComponent(r.sid) +
          '.json',
        { headers: { Authorization: 'Basic ' + auth } }
      );
      if (sr.ok) {
        const j = await sr.json();
        twilioStatus = {
          status: j.status,
          error_code: j.error_code,
          error_message: j.error_message,
        };
      }
    } catch {
      // best-effort; don't fail the test if the polling call breaks
    }
  }

  // Friendly hint for the carrier-rejection case so the realtor knows
  // exactly what's wrong and what to do about it.
  let hint: string | null = null;
  if (twilioStatus?.error_code === 30034) {
    hint =
      'US carriers blocked this text because your Twilio number is not registered with The Campaign Registry (A2P 10DLC). Fastest fix: buy a toll-free number in Twilio Console + submit Toll-Free Verification (1-2 business days). Then swap TWILIO_FROM_NUMBER in Vercel.';
  } else if (
    twilioStatus?.error_code &&
    Number(twilioStatus.error_code) >= 30000
  ) {
    hint =
      'Twilio carrier-rejected the message (error ' +
      twilioStatus.error_code +
      '). Check Twilio Console → Monitor → Logs → Errors for details.';
  }

  return NextResponse.json({
    ok: r.ok && twilioStatus?.status !== 'undelivered',
    error: r.error,
    sid: r.sid,
    to: e164,
    twilio: twilioStatus,
    hint,
    env: {
      account_sid_set: Boolean(process.env.TWILIO_ACCOUNT_SID),
      auth_token_set: Boolean(process.env.TWILIO_AUTH_TOKEN),
      from_number_set: Boolean(process.env.TWILIO_FROM_NUMBER),
    },
  });
}
