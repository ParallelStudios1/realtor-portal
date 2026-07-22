import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { redirect } from 'next/navigation';
import { RemindersClient, type ClientOption, type ScheduleRow } from './RemindersClient';

/**
 * Recurring client reminders the realtor sets up — "wish all my clients a merry
 * Christmas every year", a monthly check-in, a one-off nudge. Delivered to the
 * client as "{realtor} wants to say: {message}" via the daily cron.
 */
export const dynamic = 'force-dynamic';

export default async function RemindersPage() {
  const me = await getMe();
  if (!me?.firm_id) redirect('/login');

  const service = getSupabaseServiceRoleClient();

  // The realtor's clients, for the "specific client" target.
  const { data: deals } = await service
    .from('client_searches')
    .select(
      'id, name, client_id, client:users!client_searches_client_id_fkey ( full_name, email )'
    )
    .eq('firm_id', me.firm_id)
    .order('created_at', { ascending: false });

  const clients: ClientOption[] = ((deals as any[] | null) || []).map((d) => ({
    searchId: d.id,
    userId: d.client_id ?? null,
    email: d.client?.email ?? null,
    label:
      (d.client?.full_name || d.client?.email || 'Client') +
      (d.name ? ' — ' + d.name : ''),
  }));

  const { data: schedules } = await service
    .from('realtor_reminder_schedules')
    .select(
      'id, audience, title, message, channels, cadence, day_of_month, month, next_run, active, recipient_email, search_id'
    )
    .eq('firm_id', me.firm_id)
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Client reminders</h1>
        <p className="mt-1 text-sm text-ink-500">
          Schedule a friendly note to a client or all of them — holiday
          greetings, monthly check-ins, anything. They&apos;ll get it as
          &ldquo;{me.full_name || 'You'} wants to say: …&rdquo;.
        </p>
      </header>
      <RemindersClient
        clients={clients}
        schedules={(schedules as ScheduleRow[] | null) || []}
      />
    </main>
  );
}
