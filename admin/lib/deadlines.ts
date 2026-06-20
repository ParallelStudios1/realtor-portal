/**
 * Deadline reminders + escalation - pure helpers and the cron worker.
 *
 * This module is queue-only: it never sends anything itself. It MATERIALIZES
 * rows into public.scheduled_messages (the existing drip queue, drained by
 * admin/app/api/cron/drips/route.ts) and flips bookkeeping columns on
 * public.important_dates. The actual email/SMS/in-app dispatch happens when
 * the drips cron drains the queue - so deadline reminders ride the same
 * battle-tested send path as every other scheduled message.
 *
 * Two passes (see runDeadlineCron):
 *   (a) Materialize  - queue reminders whose fire date == today.
 *   (b) Escalation   - nag the broker about overdue, unacked deadlines.
 *
 * DATE ASSUMPTION (important):
 *   important_dates.date is a DATE (no timezone). date_reminders.offset_days
 *   is a whole-day offset. We compute the fire date as
 *     fire_date = important_dates.date - offset_days
 *   and compare it to "today" in UTC (new Date().toISOString().slice(0,10)).
 *   The drips cron runs once daily at 14:00 UTC (~09:00 ET), so "today" is
 *   stable for the whole run. If a firm operates far from UTC this can be
 *   off by a day at the boundary; that's an accepted simplification for v1.
 *   reminder.at_time is recorded but NOT used to delay within the day - once
 *   the fire date is reached we queue with scheduled_for = now() so the next
 *   drip drain picks it up immediately.
 */
import { getSupabaseServiceRoleClient } from './supabaseServer';
import { notifyDealParticipants } from './notify';

type ServiceClient = ReturnType<typeof getSupabaseServiceRoleClient>;

export type DeadlineCronSummary = {
  queued: number; // scheduled_messages rows inserted for due reminders
  escalated: number; // important_dates rows escalated to a broker
  reminders_considered: number;
  overdue_considered: number;
};

/** Channels we know how to queue. Mirrors what the drips cron can dispatch. */
export type ReminderChannel = 'email' | 'sms' | 'in_app';
export type ReminderAudience = 'staff' | 'client' | 'all_parties';

/** YYYY-MM-DD for "today" in UTC. Single source of truth for the run. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Fire date for a reminder = the date minus the offset, as a YYYY-MM-DD
 * string. `date` may be a "YYYY-MM-DD" DATE string (what Supabase returns for
 * a DATE column) or a full ISO timestamp - we only use the calendar day.
 */
export function computeFireDate(date: string, offsetDays: number): string {
  const day = String(date).slice(0, 10);
  const d = new Date(day + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() - (Number(offsetDays) || 0));
  return d.toISOString().slice(0, 10);
}

/** Days from today (UTC) until a date. Negative = overdue. */
export function daysUntil(date: string, now: Date = new Date()): number {
  const day = String(date).slice(0, 10);
  const target = new Date(day + 'T00:00:00.000Z').getTime();
  const todayMs = new Date(todayUtc(now) + 'T00:00:00.000Z').getTime();
  return Math.round((target - todayMs) / 86_400_000);
}

/** Human "in 3 days" / "today" / "2 days ago" for bodies + UI. */
export function relativeDayLabel(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Reminder body for a due deadline. Plain text - the queue formats HTML. */
export function buildDeadlineBody(args: {
  label: string;
  date: string;
  dealName?: string | null;
}): string {
  const days = daysUntil(args.date);
  const when = relativeDayLabel(days);
  const pretty = new Date(String(args.date).slice(0, 10) + 'T00:00:00.000Z')
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const dealBit = args.dealName ? ` on ${args.dealName}` : '';
  return `Reminder: "${args.label}"${dealBit} is due ${when} (${pretty}). Please make sure everything is on track.`;
}

/** Escalation body for a broker about an overdue, unacked deadline. */
export function buildEscalationBody(args: {
  label: string;
  date: string;
  dealName?: string | null;
  agentName?: string | null;
}): string {
  const days = daysUntil(args.date);
  const when = relativeDayLabel(days);
  const pretty = new Date(String(args.date).slice(0, 10) + 'T00:00:00.000Z')
    .toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const dealBit = args.dealName ? ` on ${args.dealName}` : '';
  const agentBit = args.agentName ? ` (assigned to ${args.agentName})` : '';
  return `Escalation: the deadline "${args.label}"${dealBit}${agentBit} was due ${when} (${pretty}) and has not been completed or acknowledged. It may need your attention.`;
}

/**
 * Resolve the recipients for a reminder based on its audience.
 *   staff       -> the date owner (owner_user_id) else the deal's realtor.
 *   client      -> the deal's principal client.
 *   all_parties -> handled by the caller via notifyDealParticipants resolution;
 *                  here we return the same staff+client set as a queue fallback
 *                  so in_app/email rows land for the known users on the deal.
 * Returns { user_id, email } targets; either field may be null.
 */
async function resolveAudienceRecipients(
  service: ServiceClient,
  args: {
    audience: ReminderAudience;
    searchId: string;
    ownerUserId: string | null;
  }
): Promise<Array<{ user_id: string | null; email: string | null }>> {
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `client_id, realtor_id, assigned_realtor_id,
       client:users!client_searches_client_id_fkey ( id, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, email )`
    )
    .eq('id', args.searchId)
    .maybeSingle();

  const out: Array<{ user_id: string | null; email: string | null }> = [];
  const seen = new Set<string>();
  const push = (userId: string | null, email: string | null) => {
    const key = (userId || email || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ user_id: userId, email });
  };

  const client = (deal as any)?.client;
  const realtor = (deal as any)?.realtor;

  if (args.audience === 'client') {
    if (client) push(client.id, client.email);
    return out;
  }

  if (args.audience === 'staff') {
    if (args.ownerUserId) {
      const { data: owner } = await service
        .from('users')
        .select('id, email')
        .eq('id', args.ownerUserId)
        .maybeSingle();
      if (owner) push((owner as any).id, (owner as any).email);
    } else if (realtor) {
      push(realtor.id, realtor.email);
    }
    return out;
  }

  // all_parties: staff (owner/realtor) + client. The email/in_app rows we
  // queue here cover the known users on the deal; external participants are
  // additionally reached because we also fan out via notifyDealParticipants
  // in the cron (best-effort, see runDeadlineCron).
  if (args.ownerUserId) {
    const { data: owner } = await service
      .from('users')
      .select('id, email')
      .eq('id', args.ownerUserId)
      .maybeSingle();
    if (owner) push((owner as any).id, (owner as any).email);
  }
  if (realtor) push(realtor.id, realtor.email);
  if (client) push(client.id, client.email);
  return out;
}

/**
 * Resolve the broker to escalate to for a deal: a firm_admin/owner user in
 * the same firm (most-recently-created wins for determinism). There is no
 * firms.owner column, so the broker IS the senior staff user. Returns null
 * when the firm has no admin/owner user (escalation is then skipped).
 */
async function resolveBroker(
  service: ServiceClient,
  firmId: string
): Promise<{ id: string; email: string | null } | null> {
  const { data } = await service
    .from('users')
    .select('id, email, role, created_at')
    .eq('firm_id', firmId)
    .in('role', ['firm_admin', 'owner'])
    .order('created_at', { ascending: true })
    .limit(1);
  const row = (data as any[] | null)?.[0];
  if (!row) return null;
  return { id: row.id, email: row.email ?? null };
}

/**
 * The cron worker. Safe to call standalone with a service-role client.
 *
 * @param service A service-role Supabase client (bypasses RLS). Caller is
 *                responsible for auth on whatever route invokes this.
 * @returns A summary of what was queued / escalated.
 */
export async function runDeadlineCron(
  service: ServiceClient
): Promise<DeadlineCronSummary> {
  const today = todayUtc();
  const nowIso = new Date().toISOString();
  let queued = 0;
  let escalated = 0;

  // ---- Pass (a): Materialize due reminders -------------------------------
  // Pull reminders joined to their date. We compute the fire date in JS so we
  // don't depend on a DB-side date function and can document the UTC rule.
  const { data: reminders } = await service
    .from('date_reminders')
    .select(
      `id, firm_id, date_id, search_id, offset_days, channels, audience, escalate,
       important_date:important_dates!date_reminders_date_id_fkey (
         id, label, date, completed_at, owner_user_id,
         search:client_searches!important_dates_search_id_fkey ( id, name )
       )`
    );

  const reminderRows = (reminders as any[] | null) || [];
  for (const r of reminderRows) {
    const d = r.important_date;
    if (!d || !d.date) continue;
    // Don't re-queue reminders for already-completed dates.
    if (d.completed_at) continue;

    const fireDate = computeFireDate(d.date, r.offset_days ?? 3);
    if (fireDate !== today) continue;

    // Idempotency: skip if we already queued this reminder today.
    const { data: existingRun } = await service
      .from('date_reminder_runs')
      .select('id')
      .eq('reminder_id', r.id)
      .eq('fire_on', today)
      .maybeSingle();
    if (existingRun) continue;

    const channels: ReminderChannel[] = Array.isArray(r.channels)
      ? (r.channels as ReminderChannel[])
      : ['email', 'in_app'];
    const audience = (r.audience || 'staff') as ReminderAudience;
    const body = buildDeadlineBody({
      label: d.label,
      date: d.date,
      dealName: d.search?.name ?? null,
    });
    const subject = `Reminder: ${d.label}`;

    const recipients = await resolveAudienceRecipients(service, {
      audience,
      searchId: r.search_id,
      ownerUserId: d.owner_user_id ?? null,
    });

    const inserts: any[] = [];
    for (const rec of recipients) {
      for (const channel of channels) {
        // in_app requires a recipient_user_id + search_id to route through
        // public.messages; skip in_app for recipients we only know by email.
        if (channel === 'in_app' && !rec.user_id) continue;
        // email/sms need at least one identifier.
        if (channel !== 'in_app' && !rec.email && !rec.user_id) continue;
        inserts.push({
          firm_id: r.firm_id,
          search_id: r.search_id,
          recipient_user_id: rec.user_id,
          recipient_email: rec.email,
          channel,
          kind: 'deadline',
          scheduled_for: nowIso,
          subject,
          body,
        });
      }
    }

    if (inserts.length > 0) {
      const { error: insErr } = await service
        .from('scheduled_messages')
        .insert(inserts);
      if (insErr) {
        console.error('[runDeadlineCron] queue insert failed', r.id, insErr);
        continue;
      }
      queued += inserts.length;
    }

    // For all_parties, additionally reach external participants (attorney,
    // ad-hoc emails) via the existing fan-out. Best-effort, never blocks.
    if (audience === 'all_parties') {
      try {
        await notifyDealParticipants({
          searchId: r.search_id,
          subject,
          text: body,
        });
      } catch (err) {
        console.error('[runDeadlineCron] participant fan-out failed', r.id, err);
      }
    }

    // Record the run LAST. The UNIQUE(reminder_id, fire_on) constraint is the
    // real double-send guard; the earlier select is just a fast path.
    const { error: runErr } = await service
      .from('date_reminder_runs')
      .insert({ reminder_id: r.id, fire_on: today });
    if (runErr) {
      // Likely a unique violation from a concurrent run - that's fine.
      console.error('[runDeadlineCron] run ledger insert', r.id, runErr.message);
    }
  }

  // ---- Pass (b): Escalate overdue, unacknowledged deadlines --------------
  // Candidate dates: past-due, not completed, not acknowledged, not already
  // escalated. We then keep only those that have at least one reminder with
  // escalate = true, and queue an escalation to the deal's broker.
  const { data: overdue } = await service
    .from('important_dates')
    .select(
      `id, firm_id, search_id, label, date, owner_user_id,
       search:client_searches!important_dates_search_id_fkey (
         id, name, firm_id, realtor_id,
         realtor:users!client_searches_realtor_id_fkey ( id, full_name )
       )`
    )
    .lt('date', today)
    .is('completed_at', null)
    .is('acknowledged_at', null)
    .is('escalated_at', null);

  const overdueRows = (overdue as any[] | null) || [];
  for (const d of overdueRows) {
    // Require an escalate=true reminder on this date.
    const { data: escReminder } = await service
      .from('date_reminders')
      .select('id')
      .eq('date_id', d.id)
      .eq('escalate', true)
      .limit(1)
      .maybeSingle();
    if (!escReminder) continue;

    const firmId = d.firm_id || d.search?.firm_id;
    if (!firmId) continue;

    const broker = await resolveBroker(service, firmId);
    if (!broker) continue;

    const body = buildEscalationBody({
      label: d.label,
      date: d.date,
      dealName: d.search?.name ?? null,
      agentName: d.search?.realtor?.full_name ?? null,
    });
    const subject = `Escalation: ${d.label} is overdue`;

    // Queue to the broker on both email + in_app so it can't be missed.
    const escInserts = [
      {
        firm_id: firmId,
        search_id: d.search_id,
        recipient_user_id: broker.id,
        recipient_email: broker.email,
        channel: 'email',
        kind: 'escalation',
        scheduled_for: nowIso,
        subject,
        body,
      },
      {
        firm_id: firmId,
        search_id: d.search_id,
        recipient_user_id: broker.id,
        recipient_email: broker.email,
        channel: 'in_app',
        kind: 'escalation',
        scheduled_for: nowIso,
        subject,
        body,
      },
    ];
    const { error: escErr } = await service
      .from('scheduled_messages')
      .insert(escInserts);
    if (escErr) {
      console.error('[runDeadlineCron] escalation queue failed', d.id, escErr);
      continue;
    }

    // Mark escalated so we don't nag the broker every day for the same date.
    const { error: markErr } = await service
      .from('important_dates')
      .update({ escalated_at: nowIso })
      .eq('id', d.id)
      .is('escalated_at', null); // guard against a racing run
    if (markErr) {
      console.error('[runDeadlineCron] mark escalated failed', d.id, markErr);
      continue;
    }
    escalated += 1;
  }

  return {
    queued,
    escalated,
    reminders_considered: reminderRows.length,
    overdue_considered: overdueRows.length,
  };
}
