'use server';

import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Invite a client. Three things have to happen for the rest of the app to
 * actually work:
 *
 *   1. Send a Supabase magic-link email so the client can set a password
 *   2. Create the public.users row (role='client', firm_id) so the realtor
 *      sees the client in lists immediately
 *   3. **Create a public.client_searches row** so messages, houses, and
 *      ratings have a thread to attach to. Without this, every downstream
 *      feature silently does nothing for the new client.
 *
 * The previous version inserted into a non-existent `deals` table, which
 * silently dropped step 3 — that's why messages and add-house appeared
 * broken from the realtor side.
 */
export async function inviteClientAction(fd: FormData) {
  const me = await getMe();
  if (!me?.firm_id) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent('Not signed in.'));
  }

  const fullName = (fd.get('full_name') as string)?.trim();
  const email = (fd.get('email') as string)?.trim().toLowerCase();
  const roleInDeal = ((fd.get('role_in_deal') as string) || 'buyer') as
    | 'buyer'
    | 'seller';

  if (!fullName || !email) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent('Name and email required.'));
  }

  const service = getSupabaseServiceRoleClient();

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtor-portal-ten.vercel.app';
  const redirectTo = `${baseUrl}/welcome?firm_id=${me!.firm_id}`;

  // Step 1 — send the invite (or re-resolve an existing user)
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      firm_id: me!.firm_id,
      role: 'client',
      role_in_deal: roleInDeal,
    },
    redirectTo,
  });

  if (error) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent(error.message));
  }

  if (!data?.user) {
    redirect('/dashboard/clients/new?error=' + encodeURIComponent('Invite created no user.'));
  }

  const clientId = data.user.id;

  // Step 2 — public.users row
  const { error: userErr } = await service.from('users').upsert(
    {
      id: clientId,
      firm_id: me!.firm_id,
      email,
      full_name: fullName,
      role: 'client',
    },
    { onConflict: 'id' }
  );
  if (userErr) {
    redirect(
      '/dashboard/clients/new?error=' +
        encodeURIComponent('Auth created but profile failed: ' + userErr.message)
    );
  }

  // Step 3 — client_searches row so threads/houses/messages have a parent
  const { data: existing } = await service
    .from('client_searches')
    .select('id')
    .eq('client_id', clientId)
    .eq('firm_id', me!.firm_id)
    .maybeSingle();

  if (!existing) {
    const { error: searchErr } = await service.from('client_searches').insert({
      firm_id: me!.firm_id,
      client_id: clientId,
      realtor_id: me!.user_id,
      name:
        fullName + (roleInDeal === 'seller' ? "'s Listing" : "'s Search"),
      phase: 'browsing',
      kind: roleInDeal,
    });
    if (searchErr) {
      redirect(
        '/dashboard/clients/new?error=' +
          encodeURIComponent(
            'Profile saved but search creation failed: ' + searchErr.message
          )
      );
    }
  }

  redirect('/dashboard/clients/new?ok=1');
}
