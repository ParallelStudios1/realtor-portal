import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, escapeHtml } from './email';
import { sendSms } from './sms';

/**
 * Daily trial-countdown reminder. For every firm still on a free trial (no
 * paid subscription), email + text the firm's owners/admins how many days are
 * left and link them to the billing page. Apple doesn't allow in-app payment,
 * so the mobile app stays payment-free and these nudges (plus the web billing
 * page) are how a trial converts.
 *
 * Idempotent within a day: we stamp firms.trial_reminder_sent_on with today's
 * date so a re-run won't double-send.
 */
export async function runTrialReminderCron(service: SupabaseClient) {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'https://realtorportal.parallelstudios.co';
  const billingUrl = base + '/dashboard/billing';
  const today = new Date().toISOString().slice(0, 10);

  // Firms on trial with no active subscription.
  const { data: firms, error } = await service
    .from('firms')
    .select('id, name, status, trial_ends_at, stripe_subscription_id, trial_reminder_sent_on')
    .eq('status', 'trial')
    .is('stripe_subscription_id', null);
  if (error) return { error: error.message };

  let sent = 0;
  let skipped = 0;

  for (const firm of (firms as any[]) || []) {
    if (!firm.trial_ends_at) {
      skipped++;
      continue;
    }
    if (firm.trial_reminder_sent_on === today) {
      skipped++;
      continue; // already nudged today
    }
    const ms = new Date(firm.trial_ends_at).getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(ms / 86_400_000));

    // Recipients: owners + firm admins of this firm.
    const { data: admins } = await service
      .from('users')
      .select('email, full_name, phone')
      .eq('firm_id', firm.id)
      .in('role', ['owner', 'firm_admin']);
    const recipients = (admins as any[] | null) || [];
    if (recipients.length === 0) {
      skipped++;
      continue;
    }

    const headline =
      daysLeft <= 0
        ? 'Your Realtor Portal free trial has ended'
        : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your Realtor Portal free trial`;
    const body =
      daysLeft <= 0
        ? 'Your free trial has ended. Pick a plan to keep your portal active for you and your clients.'
        : 'When your trial ends your portal pauses until you pick a plan. You can choose one any time.';

    for (const r of recipients) {
      if (r.email) {
        const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 12px;font-size:18px;font-weight:700;">${escapeHtml(headline)}</p>
  <p style="margin:0 0 16px;">${escapeHtml(body)}</p>
  <p style="margin:24px 0;">
    <a href="${billingUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;">Choose your plan</a>
  </p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">Manage your plan: ${billingUrl}</p>
</div>`.trim();
        await sendEmail({
          to: r.email,
          subject: headline,
          text: `${headline}. ${body} Choose your plan: ${billingUrl}`,
          html,
        }).catch(() => {});
      }
      if (r.phone) {
        await sendSms({
          to: r.phone,
          body: `Realtor Portal: ${headline}. Choose your plan: ${billingUrl}`,
        }).catch(() => {});
      }
    }

    await service
      .from('firms')
      .update({ trial_reminder_sent_on: today })
      .eq('id', firm.id);
    sent++;
  }

  return { ok: true, sent, skipped };
}
