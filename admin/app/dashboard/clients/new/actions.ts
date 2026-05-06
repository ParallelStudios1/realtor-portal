'use server';

import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Invite a client to the firm. Service-role is needed for auth.admin.inviteUserByEmail.
 * We tag the invite with firm_id + role in app_metadata so a Supabase trigger
 * (or the user's first sign-in) can populate public.users correctly.
 */
export async function inviteClientAction(fd: FormData) {
  const me = await getMe();
  if (!me?.firm_id) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent('Not signed in.'));
  }

  const fullName = (fd.get('full_name') as string)?.trim();
  const email = (fd.get('email') as string)?.trim().toLowerCase();
  const address = (fd.get('address') as string)?.trim() || null;
  const roleInDeal = (fd.get('role_in_deal') as string) || 'buyer';

  if (!fullName || !email) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent('Name and email required.'));
  }

  const service = getSupabaseServiceRoleClient();

  // 1) Send the invite
  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/welcome`;
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      firm_id: me!.firm_id,
      role: 'client',
      address,
      role_in_deal: roleInDeal,
    },
    redirectTo,
  });

  if (error) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent(error.message));
  }

  // 2) Pre-create the public.users row so the realtor sees the client immediately
  if (data.user) {
    await service.from('users').upsert(
      {
        id: data.user.id,
        firm_id: me!.firm_id,
        email,
        full_name: fullName,
        role: 'client',
      },
      { onConflict: 'id' }
    );

    if (address) {
      await service.from('deals').insert({
        firm_id: me!.firm_id,
        client_id: data.user.id,
        address,
        role_in_deal: roleInDeal,
        current_phase: 'initial',
      });
    }
  }

  redirect('/dashboard/clients/new?ok=1');
}
