/**
 * Unified notification helper. Every important user-visible event flows
 * through here so we have one place to add channels (email, SMS, push) and
 * one place to throttle / debug failures.
 *
 * Channels:
 *   - email  → Resend via lib/email.ts
 *   - sms    → Twilio via lib/sms.ts
 *   - push   → expo push via lib/push.ts (existing; not added here yet)
 *
 * Every channel is best-effort and never throws. Failure of one channel
 * never blocks the others.
 */
import { sendEmail } from './email';
import { sendSms, normalizeUsPhone } from './sms';
import { getSupabaseServiceRoleClient } from './supabaseServer';

export type NotifyTarget = {
  // At least one identifier is required.
  email?: string | null;
  phone?: string | null;
  // What to send.
  subject?: string;           // email subject
  text: string;               // email plain-text body (fallback for SMS)
  html?: string;              // email HTML (falls back to text if absent)
  sms_text?: string;          // optional short-form for SMS (defaults to text)
  // Whether to send via each channel. Defaults: email=true if email provided,
  // sms=true if phone provided.
  email_enabled?: boolean;
  sms_enabled?: boolean;
};

/** Send to a single target via every enabled channel. */
export async function notify(target: NotifyTarget): Promise<{
  email?: { ok: boolean; error?: string };
  sms?: { ok: boolean; error?: string };
}> {
  const result: {
    email?: { ok: boolean; error?: string };
    sms?: { ok: boolean; error?: string };
  } = {};

  const wantEmail =
    (target.email_enabled ?? Boolean(target.email)) && Boolean(target.email);
  const wantSms =
    (target.sms_enabled ?? Boolean(target.phone)) && Boolean(target.phone);

  if (wantEmail) {
    try {
      const r = await sendEmail({
        to: target.email!,
        subject: target.subject || 'Realtor Portal',
        text: target.text,
        html: target.html || `<p>${escapeMinimal(target.text)}</p>`,
      });
      result.email = { ok: !!(r as any)?.id || true };
    } catch (err: any) {
      result.email = { ok: false, error: err?.message || 'email_failed' };
      console.error('[notify] email failed', err);
    }
  }

  if (wantSms) {
    const normalized = normalizeUsPhone(target.phone!);
    if (!normalized) {
      result.sms = { ok: false, error: 'invalid_phone' };
    } else {
      try {
        const r = await sendSms({
          to: normalized,
          body: target.sms_text || target.text,
        });
        result.sms = { ok: r.ok, error: r.error };
      } catch (err: any) {
        result.sms = { ok: false, error: err?.message || 'sms_failed' };
        console.error('[notify] sms failed', err);
      }
    }
  }

  return result;
}

/**
 * Multi-target notification. Each target gets its own per-channel result.
 * Used for things like "notify everyone on this deal" — one call site,
 * automatic fan-out.
 */
export async function notifyMany(
  targets: NotifyTarget[]
): Promise<
  Array<{
    target: NotifyTarget;
    email?: { ok: boolean; error?: string };
    sms?: { ok: boolean; error?: string };
  }>
> {
  return Promise.all(
    targets.map(async (t) => {
      const r = await notify(t);
      return { target: t, ...r };
    })
  );
}

function escapeMinimal(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Fan out a notification to everyone on a deal: every public.users row
 * referenced by a deal_participant (so realtors, clients, firm staff with
 * cross-firm participant rows) + every external_email row + the principal
 * client + the assigned realtor.
 *
 * Dedupes by lower(email). Caller passes the deal id and the body — we
 * resolve the recipient list. Excludes a single user_id (the sender) so
 * we don't notify the person who triggered the event.
 */
export async function notifyDealParticipants(args: {
  searchId: string;
  subject: string;
  text: string;
  html?: string;
  sms_text?: string;
  excludeUserId?: string | null;
}): Promise<number> {
  const service = getSupabaseServiceRoleClient();

  // Pull the deal so we can include the principal client + assigned realtor.
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `client_id, realtor_id, co_realtor_id, assigned_realtor_id, attorney_email, attorney_name, attorney_phone,
       client:users!client_searches_client_id_fkey ( id, full_name, email, phone ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email, phone )`
    )
    .eq('id', args.searchId)
    .maybeSingle();

  // Pull every participant on the deal.
  const { data: participants } = await service
    .from('deal_participants')
    .select(
      'user_id, external_email, external_name, external_phone, user:users!deal_participants_user_id_fkey ( email, phone, id )'
    )
    .eq('search_id', args.searchId);

  // De-duplicate by lower(email). When no email is available, fall back to
  // the phone number as the dedup key so SMS-only recipients still ping.
  const seen = new Set<string>();
  const targets: NotifyTarget[] = [];
  const push = (
    email: string | null | undefined,
    phone: string | null | undefined,
    name: string | null | undefined,
    userId: string | null | undefined
  ) => {
    if (args.excludeUserId && userId && userId === args.excludeUserId) return;
    const dedupKey = (email || phone || '').toLowerCase();
    if (!dedupKey) return;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    targets.push({
      email: email || null,
      phone: phone || null,
      subject: args.subject,
      text: args.text,
      html: args.html,
      sms_text: args.sms_text,
    });
  };

  if (deal) {
    const client = (deal as any).client;
    const realtor = (deal as any).realtor;
    if (client) push(client.email, client.phone, client.full_name, client.id);
    if (realtor) push(realtor.email, realtor.phone, realtor.full_name, realtor.id);
    if ((deal as any).attorney_email) {
      push(
        (deal as any).attorney_email,
        (deal as any).attorney_phone,
        (deal as any).attorney_name,
        null
      );
    }
  }
  for (const p of (participants || []) as any[]) {
    if (p.user) {
      push(p.user.email, p.user.phone, null, p.user.id);
    } else {
      push(p.external_email, p.external_phone, p.external_name, null);
    }
  }

  if (targets.length === 0) return 0;
  await notifyMany(targets);
  return targets.length;
}
