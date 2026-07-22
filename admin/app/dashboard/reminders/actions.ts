'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const STAFF_ROLES = ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'];
const VALID_CHANNELS = ['email', 'sms', 'in_app'];

/** Next YYYY-MM-DD (UTC) a schedule should first fire, given its cadence. */
function computeNextRun(input: {
  cadence: 'once' | 'monthly' | 'annual';
  onceDate?: string | null;
  dayOfMonth?: number | null;
  month?: number | null;
}): string {
  const now = new Date();
  const todayY = now.getUTCFullYear();
  const todayM = now.getUTCMonth(); // 0-based
  const todayD = now.getUTCDate();

  const clampDay = (y: number, m0: number, d: number) =>
    Math.min(d, new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate());
  const fmt = (y: number, m0: number, d: number) =>
    `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (input.cadence === 'once') {
    // Fall back to tomorrow if no valid date supplied.
    if (input.onceDate && /^\d{4}-\d{2}-\d{2}$/.test(input.onceDate)) return input.onceDate;
    const t = new Date(Date.UTC(todayY, todayM, todayD + 1));
    return fmt(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  }

  if (input.cadence === 'monthly') {
    const dom = input.dayOfMonth || todayD;
    // This month if the day hasn't passed, else next month.
    if (clampDay(todayY, todayM, dom) >= todayD) {
      return fmt(todayY, todayM, clampDay(todayY, todayM, dom));
    }
    const nextM0 = (todayM + 1) % 12;
    const nextY = todayY + (todayM === 11 ? 1 : 0);
    return fmt(nextY, nextM0, clampDay(nextY, nextM0, dom));
  }

  // annual
  const m0 = (input.month || todayM + 1) - 1;
  const dom = input.dayOfMonth || 1;
  const thisYear = fmt(todayY, m0, clampDay(todayY, m0, dom));
  if (thisYear >= fmt(todayY, todayM, todayD)) return thisYear;
  return fmt(todayY + 1, m0, clampDay(todayY + 1, m0, dom));
}

export async function createReminderScheduleAction(input: {
  audience: 'client' | 'all_clients';
  searchId?: string | null;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  title?: string | null;
  message: string;
  channels: string[];
  cadence: 'once' | 'monthly' | 'annual';
  onceDate?: string | null;
  dayOfMonth?: number | null;
  month?: number | null;
}): Promise<ActionResult<{ id: string }>> {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false, error: 'Not authenticated.' };
  if (!STAFF_ROLES.includes(me.role || '')) return { ok: false, error: 'Forbidden.' };
  if (!input.message?.trim()) return { ok: false, error: 'Write a message first.' };

  const channels = (input.channels || []).filter((c) => VALID_CHANNELS.includes(c));
  if (channels.length === 0) return { ok: false, error: 'Pick at least one channel.' };
  if (input.audience === 'client' && !input.searchId && !input.recipientUserId && !input.recipientEmail) {
    return { ok: false, error: 'Pick a client to remind.' };
  }

  const service = getSupabaseServiceRoleClient();
  const nextRun = computeNextRun(input);

  const { data, error } = await service
    .from('realtor_reminder_schedules')
    .insert({
      firm_id: me.firm_id,
      created_by: me.user_id,
      audience: input.audience,
      search_id: input.audience === 'all_clients' ? null : input.searchId ?? null,
      recipient_user_id: input.audience === 'all_clients' ? null : input.recipientUserId ?? null,
      recipient_email: input.audience === 'all_clients' ? null : input.recipientEmail ?? null,
      title: input.title?.trim() || null,
      message: input.message.trim(),
      channels,
      cadence: input.cadence,
      day_of_month: input.dayOfMonth ?? null,
      month: input.cadence === 'annual' ? input.month ?? null : null,
      next_run: nextRun,
      active: true,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message || 'Could not save.' };
  revalidatePath('/dashboard/reminders');
  return { ok: true, id: (data as any).id };
}

export async function deleteReminderScheduleAction(
  id: string
): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false, error: 'Not authenticated.' };
  if (!STAFF_ROLES.includes(me.role || '')) return { ok: false, error: 'Forbidden.' };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('realtor_reminder_schedules')
    .delete()
    .eq('id', id)
    .eq('firm_id', me.firm_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard/reminders');
  return { ok: true };
}

export async function toggleReminderScheduleAction(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false, error: 'Not authenticated.' };
  if (!STAFF_ROLES.includes(me.role || '')) return { ok: false, error: 'Forbidden.' };
  const service = getSupabaseServiceRoleClient();
  const { error } = await service
    .from('realtor_reminder_schedules')
    .update({ active })
    .eq('id', id)
    .eq('firm_id', me.firm_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard/reminders');
  return { ok: true };
}
