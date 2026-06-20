'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';
import { PLANS } from '@/lib/plans';
import { getSeatUsage } from '@/lib/seats';

/**
 * Firm Control actions. Only callable by users whose role is
 * 'owner' | 'firm_admin' | 'super_admin'. Managers can invite realtors
 * but cannot promote anyone to owner/firm_admin — enforced at the action
 * boundary.
 */

export type FirmRole =
  | 'owner'
  | 'firm_admin'
  | 'manager'
  | 'realtor'
  | 'agent';

const FIRM_ROLES: FirmRole[] = [
  'owner',
  'firm_admin',
  'manager',
  'realtor',
  'agent',
];

async function authorize(min: 'staff' | 'admin' = 'staff') {
  const me = await getMe();
  if (!me?.firm_id) return { error: 'Not signed in.' as const };
  const staffRoles = [
    'owner',
    'firm_admin',
    'super_admin',
    'manager',
    'realtor',
    'agent',
  ];
  const adminRoles = ['owner', 'firm_admin', 'super_admin'];
  const pool = min === 'admin' ? adminRoles : staffRoles;
  if (!pool.includes(me.role || '')) {
    return { error: 'You do not have permission for this.' as const };
  }
  return { me };
}

/**
 * Invite a realtor / manager / etc. into the firm. Sends a Supabase
 * magic-link invite + creates a firm_invites row for tracking.
 */
export async function inviteFirmMemberAction(payload: {
  email: string;
  full_name: string;
  role: FirmRole;
}) {
  const a = await authorize('admin');
  if ('error' in a) return { ok: false as const, error: a.error };
  const email = payload.email?.trim().toLowerCase();
  const full_name = payload.full_name?.trim();
  if (!email || !full_name)
    return { ok: false as const, error: 'Name and email required.' };
  if (!FIRM_ROLES.includes(payload.role))
    return { ok: false as const, error: 'Invalid role.' };
  // Owners and firm_admins can be created only by an admin/owner. Manager
  // would be blocked above when min='admin'; safe.

  const service = getSupabaseServiceRoleClient();

  // ---- Seat-cap enforcement ----
  // A firm's seat cap comes from its Stripe plan tier. Trial / unsubbed
  // firms get the Solo cap (1). Seat usage is computed by the shared,
  // dedup-safe helper so the cap check and the billing display always
  // agree, and an invited realtor is never counted twice.
  const usage = await getSeatUsage(a.me.firm_id!);
  // If the invitee is already a member or already a pending invite, this
  // isn't a new seat — let it through (re-send / role update).
  const emailIsExisting = await (async () => {
    const { data: u } = await service
      .from('users')
      .select('id')
      .eq('firm_id', a.me.firm_id!)
      .ilike('email', email)
      .maybeSingle();
    return Boolean(u);
  })();
  if (!emailIsExisting && usage.usedSeats >= usage.seatCap) {
    const planName = usage.effectiveTier ? PLANS[usage.effectiveTier].name : 'Solo';
    return {
      ok: false as const,
      error:
        'Your ' +
        planName +
        ' plan includes ' +
        usage.seatCap +
        ' seat' +
        (usage.seatCap === 1 ? '' : 's') +
        '. Upgrade to add more team members.',
    };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtorportal.parallelstudios.co';

  // Provision the staff account WITHOUT a Supabase magic-link email.
  // Firm staff (owner/admin/manager/realtor/member) join the EXISTING host
  // firm and sign in at /login with a password. There is no /invite/<token>
  // landing for host-firm staff roles (deal_invites only covers external
  // collaborators + clients), so we create the account with a temporary
  // password and send it in OUR branded email. New users only — for an
  // existing account we never reset their password.
  let userId: string | undefined;
  let isNewAccount = false;
  let tempPassword: string | null = null;
  const genTemp = () =>
    'Rp-' +
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6).toUpperCase();
  const newPassword = genTemp();
  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email,
      email_confirm: true,
      password: newPassword,
      user_metadata: {
        full_name,
        firm_id: a.me.firm_id,
        role: payload.role,
      },
    });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    return { ok: false as const, error: createErr.message };
  }
  if (created?.user?.id) {
    userId = created.user.id;
    isNewAccount = true;
    tempPassword = newPassword;
  } else {
    const { data: existing } = await service
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = existing?.id;
    if (!userId) {
      const { data: list } = await service.auth.admin.listUsers();
      userId = list?.users?.find((u) => u.email?.toLowerCase() === email)?.id;
    }
  }

  if (userId) {
    await service.from('users').upsert(
      {
        id: userId,
        firm_id: a.me.firm_id,
        email,
        full_name,
        role: payload.role,
      },
      { onConflict: 'id' }
    );
  }

  // The staff account is provisioned immediately above (temp password +
  // branded email), so this invite is effectively accepted the moment it's
  // created. Stamp accepted_at NOW so the person counts as one member — not
  // a member AND a lingering "pending invite" (the old double-count bug).
  await service.from('firm_invites').upsert(
    {
      firm_id: a.me.firm_id!,
      email,
      full_name,
      role: payload.role,
      invited_by: a.me.user_id,
      accepted_at: userId ? new Date().toISOString() : null,
    },
    { onConflict: 'firm_id,email' }
  );

  // Fire-and-forget branded welcome email via Resend (NOT a Supabase auth
  // email). For a brand-new account we include a temporary password they use
  // to sign in at /login (and should change afterward). For an existing
  // account we just point them at /login with their current password.
  try {
    const safe = escapeHtml(full_name);
    const safeRole = escapeHtml(payload.role);
    const loginUrl = baseUrl + '/login';
    const credBlockHtml =
      isNewAccount && tempPassword
        ? `<p style="margin:0 0 16px;">Sign in with this temporary password and change it once you're in:</p>
  <p style="margin:0 0 16px;font-family:ui-monospace,Menlo,monospace;font-size:15px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;display:inline-block;">${escapeHtml(
            tempPassword
          )}</p>`
        : `<p style="margin:0 0 16px;">Sign in with your existing Realtor Portal password.</p>`;
    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">Hi ${safe},</p>
  <p style="margin:0 0 16px;">You've been added as <strong>${safeRole}</strong> to your firm on Realtor Portal.</p>
  ${credBlockHtml}
  <p style="margin:24px 0;">
    <a href="${loginUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;">Sign in &rarr;</a>
  </p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">If the button above doesn't work, paste this link into your browser: ${loginUrl}</p>
</div>`.trim();
    const text =
      isNewAccount && tempPassword
        ? `${full_name} — you've been added as ${payload.role} to your firm on Realtor Portal.\n\n` +
          `Sign in here: ${loginUrl}\nTemporary password: ${tempPassword}\n\nPlease change your password after signing in.`
        : `${full_name} — you've been added as ${payload.role} to your firm on Realtor Portal.\n\n` +
          `Sign in with your existing password: ${loginUrl}`;
    await sendEmail({
      to: email,
      subject: "You've been added to a Realtor Portal firm",
      text,
      html,
    });
  } catch {}

  revalidatePath('/dashboard/firm');
  return { ok: true as const };
}

export async function changeMemberRoleAction(payload: {
  user_id: string;
  role: FirmRole;
}) {
  const a = await authorize('admin');
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!FIRM_ROLES.includes(payload.role))
    return { ok: false as const, error: 'Invalid role.' };
  // Can't remove the last owner (basic safety).
  const service = getSupabaseServiceRoleClient();
  const { data: target } = await service
    .from('users')
    .select('id, role, firm_id')
    .eq('id', payload.user_id)
    .maybeSingle();
  if (!target || target.firm_id !== a.me.firm_id)
    return { ok: false as const, error: 'User not found in your firm.' };
  if ((target as any).role === 'owner' && payload.role !== 'owner') {
    const { count } = await service
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('firm_id', a.me.firm_id)
      .eq('role', 'owner');
    if ((count || 0) <= 1)
      return {
        ok: false as const,
        error: 'Can\'t demote the last owner — promote someone first.',
      };
  }
  const { error } = await service
    .from('users')
    .update({ role: payload.role })
    .eq('id', payload.user_id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/firm');
  return { ok: true as const };
}

export async function removeMemberAction(user_id: string) {
  const a = await authorize('admin');
  if ('error' in a) return { ok: false as const, error: a.error };
  if (user_id === a.me.user_id)
    return { ok: false as const, error: 'You can\'t remove yourself.' };
  const service = getSupabaseServiceRoleClient();
  const { data: target } = await service
    .from('users')
    .select('id, firm_id, role')
    .eq('id', user_id)
    .maybeSingle();
  if (!target || target.firm_id !== a.me.firm_id)
    return { ok: false as const, error: 'User not in your firm.' };
  // Detach but don't delete the auth user — owner can purge through the
  // safe-delete function if they truly want to wipe.
  const { error } = await service
    .from('users')
    .update({ firm_id: null, role: 'client' })
    .eq('id', user_id);
  if (error) return { ok: false as const, error: error.message };
  // Unassign any deals they owned.
  await service
    .from('client_searches')
    .update({ realtor_id: null })
    .eq('realtor_id', user_id)
    .eq('firm_id', a.me.firm_id!);
  await service
    .from('client_searches')
    .update({ assigned_realtor_id: null })
    .eq('assigned_realtor_id', user_id)
    .eq('firm_id', a.me.firm_id!);
  revalidatePath('/dashboard/firm');
  return { ok: true as const };
}

/**
 * Save per-firm phase label overrides. JSONB so we can add phases later
 * without re-migrating. Owners + firm_admins only.
 */
export async function saveFirmPhaseLabelsAction(payload: {
  labels: Record<string, string>;
  messages?: Record<string, string>;
}) {
  const a = await authorize('admin');
  if ('error' in a) return { ok: false as const, error: a.error };
  const service = getSupabaseServiceRoleClient();
  const update: Record<string, any> = {
    phase_labels: payload.labels || {},
  };
  if (payload.messages) update.phase_messages = payload.messages;
  const { error } = await service
    .from('firms')
    .update(update)
    .eq('id', a.me.firm_id!);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/firm');
  return { ok: true as const };
}

/** Manager+ assigns or reassigns the realtor on a deal. */
export async function assignDealRealtorAction(payload: {
  search_id: string;
  realtor_id: string | null;
}) {
  const a = await authorize('staff');
  if ('error' in a) return { ok: false as const, error: a.error };
  if (!['owner', 'firm_admin', 'super_admin', 'manager'].includes(a.me.role || ''))
    return {
      ok: false as const,
      error: 'Managers and firm admins can reassign deals.',
    };
  const service = getSupabaseServiceRoleClient();
  const { data: search } = await service
    .from('client_searches')
    .select('id, firm_id')
    .eq('id', payload.search_id)
    .maybeSingle();
  if (!search || search.firm_id !== a.me.firm_id)
    return { ok: false as const, error: 'Deal not in your firm.' };
  const { error } = await service
    .from('client_searches')
    .update({ realtor_id: payload.realtor_id })
    .eq('id', payload.search_id);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/dashboard/deals/' + payload.search_id);
  revalidatePath('/dashboard/firm');
  return { ok: true as const };
}
