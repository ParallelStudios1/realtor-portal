import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Realtor recurring-reminder cron.
 *
 * For every active schedule whose next_run has arrived (<= today, UTC), we drop
 * one row into public.scheduled_messages per chosen channel. The drips cron
 * picks those up and actually sends them. Then we advance next_run for the
 * cadence (or deactivate a 'once' schedule).
 *
 * Idempotency: we advance next_run in the same pass, so a given schedule can
 * only enqueue once per due date even if the cron runs twice.
 */

type Schedule = {
  id: string;
  firm_id: string;
  created_by: string | null;
  audience: 'client' | 'all_clients';
  search_id: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
  title: string | null;
  message: string;
  channels: string[] | null;
  cadence: 'once' | 'monthly' | 'annual';
  day_of_month: number | null;
  month: number | null;
  next_run: string; // YYYY-MM-DD
};

/** A single resolved recipient of a reminder. */
type Target = {
  search_id: string | null;
  recipient_user_id: string | null;
  recipient_email: string | null;
};

const VALID_CHANNELS = new Set(['email', 'sms', 'in_app']);

/** Today's date in UTC as YYYY-MM-DD. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Clamp a day to a month's length (e.g. Feb 31 -> Feb 28/29). */
function clampDay(year: number, monthIndex0: number, day: number): number {
  const last = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  return Math.min(day, last);
}

/** Compute the next_run after a schedule fires. Returns null to deactivate. */
export function advanceNextRun(s: Schedule, from: string): string | null {
  const [y, m, d] = from.split('-').map((n) => parseInt(n, 10));
  if (s.cadence === 'once') return null;
  if (s.cadence === 'monthly') {
    // Next month, same day-of-month (clamped).
    const nextMonthIndex0 = m; // m is 1-based; m as index0 = next month
    const year = y + Math.floor(nextMonthIndex0 / 12);
    const monthIndex0 = nextMonthIndex0 % 12;
    const day = clampDay(year, monthIndex0, s.day_of_month || d);
    return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // annual: same month/day next year.
  const year = y + 1;
  const monthIndex0 = (s.month || m) - 1;
  const day = clampDay(year, monthIndex0, s.day_of_month || d);
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export async function runRealtorReminderCron(service: SupabaseClient): Promise<{
  considered: number;
  queued: number;
  advanced: number;
}> {
  const today = todayUtc();

  const { data, error } = await service
    .from('realtor_reminder_schedules')
    .select(
      `id, firm_id, created_by, audience, search_id, recipient_user_id,
       recipient_email, title, message, channels, cadence, day_of_month,
       month, next_run`
    )
    .eq('active', true)
    .lte('next_run', today)
    .limit(500);

  if (error) throw new Error(error.message);
  const schedules = (data as Schedule[] | null) || [];

  let queued = 0;
  let advanced = 0;

  for (const s of schedules) {
    const channels = (s.channels || ['email']).filter((c) => VALID_CHANNELS.has(c));

    // Resolve who this schedule reaches.
    let targets: Target[] = [];
    if (s.audience === 'all_clients') {
      // Every active client the authoring realtor owns in this firm.
      const { data: deals } = await service
        .from('client_searches')
        .select('id, client_id, client:users!client_searches_client_id_fkey ( email )')
        .eq('firm_id', s.firm_id)
        .eq('realtor_id', s.created_by);
      targets = ((deals as any[] | null) || [])
        .filter((d) => d.client_id || d.client?.email)
        .map((d) => ({
          search_id: d.id,
          recipient_user_id: d.client_id ?? null,
          recipient_email: d.client?.email ?? null,
        }));
    } else {
      targets = [
        {
          search_id: s.search_id,
          recipient_user_id: s.recipient_user_id,
          recipient_email: s.recipient_email,
        },
      ];
    }

    // Name to attribute the note to: "{realtor} wants to say: ...".
    let realtorName = 'Your agent';
    if (s.created_by) {
      const { data: r } = await service
        .from('users')
        .select('full_name')
        .eq('id', s.created_by)
        .maybeSingle();
      if ((r as any)?.full_name) realtorName = (r as any).full_name;
    }
    const body = `${realtorName} wants to say: ${s.message}`;
    const subject = s.title || `A note from ${realtorName}`;

    const rows = targets.flatMap((t) =>
      channels.map((channel) => ({
        firm_id: s.firm_id,
        search_id: t.search_id,
        recipient_user_id: t.recipient_user_id,
        recipient_email: t.recipient_email,
        channel,
        kind: 'reminder' as const,
        scheduled_for: new Date().toISOString(),
        subject,
        body,
      }))
    );

    if (rows.length > 0) {
      const { error: qErr } = await service.from('scheduled_messages').insert(rows);
      if (qErr) {
        console.error('[realtorReminders] enqueue failed', s.id, qErr.message);
        continue; // leave next_run so it retries tomorrow
      }
      queued += rows.length;
    }

    const next = advanceNextRun(s, s.next_run);
    const { error: uErr } = await service
      .from('realtor_reminder_schedules')
      .update(
        next === null
          ? { active: false, last_run_at: new Date().toISOString() }
          : { next_run: next, last_run_at: new Date().toISOString() }
      )
      .eq('id', s.id);
    if (!uErr) advanced++;
  }

  return { considered: schedules.length, queued, advanced };
}
