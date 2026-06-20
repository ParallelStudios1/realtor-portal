/**
 * Tiny Twilio wrapper. We don't bundle the twilio SDK - it's a 5MB
 * dependency and we only need one POST. The REST API is dead simple.
 *
 * Required env vars (set in Vercel project settings):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER     (E.164, e.g. +15551234567)
 *
 * If any are missing, sendSms() is a no-op that logs and returns
 * { ok: false, error: 'sms_not_configured' } so the calling code doesn't
 * have to special-case dev environments.
 */
export async function sendSms(input: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.warn('[sms] sendSms called but Twilio env vars are not set');
    return { ok: false, error: 'sms_not_configured' };
  }

  const url =
    'https://api.twilio.com/2010-04-01/Accounts/' +
    encodeURIComponent(sid) +
    '/Messages.json';

  const auth = Buffer.from(sid + ':' + token).toString('base64');

  // Compliance: every message should identify the sender and how to opt out.
  // Append a STOP footer when the body doesn't already contain one, and prefix
  // the platform name when the body doesn't already start with it.
  let body = input.body.trim();
  if (!/\bstop\b/i.test(body)) {
    body = body + '\n\nReply STOP to opt out.';
  }
  if (!/realtor portal/i.test(body.slice(0, 40))) {
    body = 'Realtor Portal: ' + body;
  }

  const form = new URLSearchParams();
  form.set('To', input.to);
  form.set('From', from);
  form.set('Body', body.slice(0, 1500));

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('[sms] Twilio error', r.status, text);
      return { ok: false, error: 'twilio_' + r.status };
    }
    const json = (await r.json()) as any;
    return { ok: true, sid: json?.sid };
  } catch (err: any) {
    console.error('[sms] fetch threw', err);
    return { ok: false, error: err?.message || 'unknown' };
  }
}

/**
 * Normalize a user-typed phone number to E.164 for US callers. Returns
 * undefined when the input is too short / non-numeric to be a real number.
 */
export function normalizeUsPhone(raw: string): string | undefined {
  const digits = (raw || '').replace(/\D+/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (digits.length >= 11) return '+' + digits;
  return undefined;
}
