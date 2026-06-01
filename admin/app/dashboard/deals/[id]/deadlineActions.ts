'use server';

/**
 * Server actions for deadline reminders + escalation, scoped to a single
 * deal/important-date. Called from DeadlineReminderEditor (client component).
 *
 * Conventions (match clients/[id]/actions.ts):
 *   - Returns { ok: true, ... } on success.
 *   - Returns { ok: false, error: string } on failure (UI shows toast).
 *   - getMe() for auth + role, service-role client for the writes.
 *   - Every mutation writes an `activities` row (deal timeline) and calls
 *     logAudit (compliance trail), then revalidatePath the deal page.
 */
import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { logAudit } from '@/lib/audit';
import type { ReminderChannel, ReminderAudience } from '@/lib/deadlines';

type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const STAFF_ROLES = ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'];

/**
 * Authorize the caller against an important_date: returns the date row (with
 * its firm_id + search_id) when the caller is staff in the date's firm.
 * Cross-firm guest collaborators are intentionally NOT covered here — date
 * ownership/escalation is a host-firm concern.
 */
type AuthOk = {
  ok: true;
  me: NonNullable<Awaited<ReturnType<typeof getMe>>>;
  date: any;
  service: ReturnType<typeof getSupabaseServiceRoleClient>;
};
type AuthErr = { ok: false; error: string };

async function authorizeDate(dateId: string): Promise<AuthOk | AuthErr> {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false, error: 'Not authenticated.' };
  if (!STAFF_ROLES.includes(me.role || '')) return { ok: false, error: 'Forbidden.' };

  const service = getSupabaseServiceRoleClient();
  const { data: date } = await service
    .from('important_dates')
    .select('id, firm_id, search_id, label, date')
    .eq('id', dateId)
    .maybeSingle();
  if (!date) return { ok: false, error: 'Date not found.' };
  if ((date as any).firm_id !== me.firm_id && me.role !== 'super_admin')
    return { ok: false, error: 'Forbidden.' };
  return { ok: true, me, date: date as any, service };
}

function revalidateDeal(searchId: string) {
  revalidatePath(`/dashboard/deals/${searchId}`);
}

/** Add a reminder rule (offset/channels/audience) to an important_date. */
export async function addDateReminderAction(input: {
  dateId: string;
  offsetDays: number;
  channels: ReminderChannel[];
  audience: ReminderAudience;
  escalate: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeDate(input.dateId);
  if (!auth.ok) return auth;
  const { me, date, service } = auth;

  const channels =
    Array.isArray(input.channels) && input.channels.length > 0
      ? input.channels
      : (['email', 'in_app'] as ReminderChannel[]);
  const offset = Number.isFinite(input.offsetDays)
    ? Math.max(0, Math.min(60, Math.trunc(input.offsetDays)))
    : 3;

  const { data: inserted, error } = await service
    .from('date_reminders')
    .insert({
      firm_id: date.firm_id,
      date_id: date.id,
      search_id: date.search_id,
      offset_days: offset,
      channels,
      audience: input.audience || 'staff',
      escalate: input.escalate !== false,
      created_by: me.user_id,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    return { ok: false, error: error?.message || 'Failed to add reminder.' };
  }

  await service.from('activities').insert({
    firm_id: date.firm_id,
    search_id: date.search_id,
    actor_id: me.user_id,
    action: 'reminder_added',
    target: date.label,
    metadata: { date_id: date.id, offset_days: offset, audience: input.audience },
  });
  await logAudit({
    firmId: date.firm_id,
    searchId: date.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'date_reminder.add',
    entityType: 'important_date',
    entityId: date.id,
    summary: `Added a ${offset}-day reminder for "${date.label}"`,
    metadata: { reminder_id: (inserted as any).id, channels, audience: input.audience },
  });

  revalidateDeal(date.search_id);
  return { ok: true, id: (inserted as any).id };
}

/** Remove a reminder rule. Verifies it belongs to the caller's firm. */
export async function removeDateReminderAction(input: {
  reminderId: string;
}): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false, error: 'Not authenticated.' };
  if (!STAFF_ROLES.includes(me.role || '')) return { ok: false, error: 'Forbidden.' };

  const service = getSupabaseServiceRoleClient();
  const { data: reminder } = await service
    .from('date_reminders')
    .select('id, firm_id, search_id, date_id, important_date:important_dates!date_reminders_date_id_fkey ( label )')
    .eq('id', input.reminderId)
    .maybeSingle();
  if (!reminder) return { ok: false, error: 'Reminder not found.' };
  if ((reminder as any).firm_id !== me.firm_id && me.role !== 'super_admin')
    return { ok: false, error: 'Forbidden.' };

  const { error } = await service
    .from('date_reminders')
    .delete()
    .eq('id', input.reminderId);
  if (error) return { ok: false, error: error.message };

  await service.from('activities').insert({
    firm_id: (reminder as any).firm_id,
    search_id: (reminder as any).search_id,
    actor_id: me.user_id,
    action: 'reminder_removed',
    target: (reminder as any).important_date?.label || 'deadline',
    metadata: { date_id: (reminder as any).date_id },
  });
  await logAudit({
    firmId: (reminder as any).firm_id,
    searchId: (reminder as any).search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'date_reminder.remove',
    entityType: 'important_date',
    entityId: (reminder as any).date_id,
    summary: 'Removed a deadline reminder',
    metadata: { reminder_id: input.reminderId },
  });

  revalidateDeal((reminder as any).search_id);
  return { ok: true };
}

/** Mark an important_date complete (stamps completed_at/_by). */
export async function completeImportantDateAction(input: {
  dateId: string;
}): Promise<ActionResult> {
  const auth = await authorizeDate(input.dateId);
  if (!auth.ok) return auth;
  const { me, date, service } = auth;

  const { error } = await service
    .from('important_dates')
    .update({ completed_at: new Date().toISOString(), completed_by: me.user_id })
    .eq('id', date.id);
  if (error) return { ok: false, error: error.message };

  await service.from('activities').insert({
    firm_id: date.firm_id,
    search_id: date.search_id,
    actor_id: me.user_id,
    action: 'deadline_completed',
    target: date.label,
    metadata: { date_id: date.id },
  });
  await logAudit({
    firmId: date.firm_id,
    searchId: date.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'important_date.complete',
    entityType: 'important_date',
    entityId: date.id,
    summary: `Marked "${date.label}" done`,
  });

  revalidateDeal(date.search_id);
  return { ok: true };
}

/** Acknowledge an important_date (suppresses escalation without completing). */
export async function acknowledgeImportantDateAction(input: {
  dateId: string;
}): Promise<ActionResult> {
  const auth = await authorizeDate(input.dateId);
  if (!auth.ok) return auth;
  const { me, date, service } = auth;

  const { error } = await service
    .from('important_dates')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', date.id);
  if (error) return { ok: false, error: error.message };

  await service.from('activities').insert({
    firm_id: date.firm_id,
    search_id: date.search_id,
    actor_id: me.user_id,
    action: 'deadline_acknowledged',
    target: date.label,
    metadata: { date_id: date.id },
  });
  await logAudit({
    firmId: date.firm_id,
    searchId: date.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'important_date.acknowledge',
    entityType: 'important_date',
    entityId: date.id,
    summary: `Acknowledged "${date.label}"`,
  });

  revalidateDeal(date.search_id);
  return { ok: true };
}

/** Set (or clear) the owner of an important_date. ownerUserId null clears it. */
export async function setDateOwnerAction(input: {
  dateId: string;
  ownerUserId: string | null;
}): Promise<ActionResult> {
  const auth = await authorizeDate(input.dateId);
  if (!auth.ok) return auth;
  const { me, date, service } = auth;

  // If an owner is given, verify they're a user in the same firm.
  if (input.ownerUserId) {
    const { data: owner } = await service
      .from('users')
      .select('id, firm_id, full_name')
      .eq('id', input.ownerUserId)
      .maybeSingle();
    if (!owner || (owner as any).firm_id !== date.firm_id) {
      return { ok: false, error: 'Owner must be a member of this firm.' };
    }
  }

  const { error } = await service
    .from('important_dates')
    .update({ owner_user_id: input.ownerUserId })
    .eq('id', date.id);
  if (error) return { ok: false, error: error.message };

  await service.from('activities').insert({
    firm_id: date.firm_id,
    search_id: date.search_id,
    actor_id: me.user_id,
    action: 'deadline_owner_set',
    target: date.label,
    metadata: { date_id: date.id, owner_user_id: input.ownerUserId },
  });
  await logAudit({
    firmId: date.firm_id,
    searchId: date.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'important_date.set_owner',
    entityType: 'important_date',
    entityId: date.id,
    summary: input.ownerUserId ? `Assigned owner for "${date.label}"` : `Cleared owner for "${date.label}"`,
    metadata: { owner_user_id: input.ownerUserId },
  });

  revalidateDeal(date.search_id);
  return { ok: true };
}
