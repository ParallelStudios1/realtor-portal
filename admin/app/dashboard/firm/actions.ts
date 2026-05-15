'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';

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

  // Send the magic-link invite.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtor-portal-ten.vercel.app';
  const redirectTo =
    baseUrl + '/welcome?firm_id=' + (a.me.firm_id || '') + '&staff=1';

  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name,
      firm_id: a.me.firm_id,
      role: payload.role,
    },
    redirectTo,
  });
  if (error && !/already/i.test(error.message)) {
    return { ok: false as const, error: error.message };
  }
  let userId = data?.user?.id;
  if (!userId) {
    const { data: existing } = await service
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    userId = existing?.id;
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

  await service.from('firm_invites').upsert(
    {
      firm_id: a.me.firm_id!,
      email,
      full_name,
      role: payload.role,
      invited_by: a.me.user_id,
    },
    { onConflict: 'firm_id,email' }
  );

  // Fire-and-forget welcome email (separate from the Supabase magic link).
  try {
    const safe = escapeHtml(full_name);
    await sendEmail({
      to: email,
      subject: 'You\'ve been added to a Realtor Portal firm',
      text:
        full_name +
        ' — you have been added as a ' +
        payload.role +
        ' to your firm on Realtor Portal. Check your inbox for the sign-in link.',
      html:
        '<p>Hi ' +
        safe +
        ',</p><p>You\'ve been added as a <strong>' +
        payload.role +
        '</strong> at your firm on Realtor Portal. Look for the magic-link email from <em>noreply@parallelstudios.co</em> to sign in.</p>',
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
