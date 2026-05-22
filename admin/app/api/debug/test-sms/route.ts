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
 * Only staff users in a firm can hit this — clients shouldn't be able
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
      'Realtor Portal test — wiring works. From: ' +
      (me.full_name || me.email || 'your firm') +
      '.',
  });

  return NextResponse.json({
    ok: r.ok,
    error: r.error,
    sid: r.sid,
    to: e164,
    env: {
      account_sid_set: Boolean(process.env.TWILIO_ACCOUNT_SID),
      auth_token_set: Boolean(process.env.TWILIO_AUTH_TOKEN),
      from_number_set: Boolean(process.env.TWILIO_FROM_NUMBER),
    },
  });
}
