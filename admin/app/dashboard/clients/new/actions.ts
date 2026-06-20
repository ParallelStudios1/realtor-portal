'use server';

import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { sendEmail, escapeHtml } from '@/lib/email';

/**
 * Invite a client. Several things have to happen for the rest of the app to
 * actually work:
 *
 *   1. Provision the client's account WITHOUT a Supabase magic-link email
 *      (createUser, random password, email pre-confirmed). The recipient
 *      sets their real password later on /invite/<token>.
 *   2. Create the public.users row (role='client', firm_id) so the realtor
 *      sees the client in lists immediately
 *   3. **Create a public.client_searches row** so messages, houses, and
 *      ratings have a thread to attach to. Without this, every downstream
 *      feature silently does nothing for the new client.
 *   4. Create a deal_invites token + send OUR branded Resend email whose
 *      CTA opens /invite/<token>. No Supabase auth email is ever sent.
 *
 * The previous version inserted into a non-existent `deals` table, which
 * silently dropped step 3 - that's why messages and add-house appeared
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
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtorportal.parallelstudios.co';

  // Step 1 - provision the account WITHOUT a Supabase magic-link email.
  // createUser with a random password + email_confirm. The client sets their
  // real password later on /invite/<token>. If they already exist, resolve id.
  let clientId: string | undefined;
  const { data: created, error: createErr } =
    await service.auth.admin.createUser({
      email,
      email_confirm: true,
      password:
        'rp_' +
        Math.random().toString(36).slice(2) +
        Math.random().toString(36).slice(2),
      user_metadata: {
        full_name: fullName,
        firm_id: me!.firm_id,
        role: 'client',
        role_in_deal: roleInDeal,
      },
    });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    redirect(
      '/dashboard/clients/new?error=' + encodeURIComponent(createErr.message)
    );
  }
  clientId = created?.user?.id;
  if (!clientId) {
    const { data: existingUser } = await service
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    clientId = existingUser?.id;
  }
  if (!clientId) {
    const { data: list } = await service.auth.admin.listUsers();
    clientId = list?.users?.find((u) => u.email?.toLowerCase() === email)?.id;
  }
  if (!clientId) {
    redirect(
      '/dashboard/clients/new?error=' +
        encodeURIComponent('Could not resolve user id after invite.')
    );
  }

  // Step 2 - public.users row
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

  // Step 3 - DON'T auto-create a deal anymore. A client can have many deals
  // over time (a buyer search this year, a listing next year, an investment
  // property the year after). Auto-creating a stub deal whenever you invite
  // a client clutters the deals workspace and forces the realtor to delete
  // empties. Instead, land them on the client profile and let them hit
  // "+ New deal" when they have one.
  //
  // We do however check if the realtor passed ?withDeal=1 (set from the
  // "Invite + start a deal now" toggle in the new-client form) so the old
  // flow stays available with a single click.
  const wantDealNow = fd.get('start_deal') === '1';

  // We need a client_searches row to anchor the deal_invites token (its
  // search_id is NOT NULL). Reuse one if the client already has one for this
  // firm; otherwise create it. This is the same row the "start a deal now"
  // flow would create, so there's no extra clutter beyond one search per
  // invited client.
  let searchId: string | null = null;
  {
    const { data: existing } = await service
      .from('client_searches')
      .select('id')
      .eq('client_id', clientId)
      .eq('firm_id', me!.firm_id)
      .maybeSingle();
    searchId = existing?.id ?? null;
    if (!searchId) {
      const { data: createdSearch, error: searchErr } = await service
        .from('client_searches')
        .insert({
          firm_id: me!.firm_id,
          client_id: clientId,
          realtor_id: me!.user_id,
          // Deal admin = the staffer creating/inviting this client's deal.
          created_by: me!.user_id,
          name:
            fullName + (roleInDeal === 'seller' ? "'s Listing" : "'s Search"),
          phase: 'searching',
          kind: roleInDeal,
        })
        .select('id')
        .single();
      if (searchErr) {
        redirect(
          '/dashboard/clients/new?error=' +
            encodeURIComponent(
              'Profile saved but search creation failed: ' + searchErr.message
            )
        );
      }
      searchId = createdSearch?.id ?? null;
    }
  }

  // Step 4 - create the deal_invites token + send OUR branded Resend email.
  // The CTA opens /invite/<token>, where the client sets a password and signs
  // in. No Supabase auth/magic-link email is ever sent.
  if (searchId) {
    const { data: inviteRow, error: inviteErr } = await service
      .from('deal_invites')
      .insert({
        search_id: searchId,
        firm_id: me!.firm_id,
        role: roleInDeal, // 'buyer' | 'seller' → isClient branch on accept
        name: fullName,
        email,
        created_by: me!.user_id,
      })
      .select('token')
      .single();
    if (inviteErr) {
      console.error('[inviteClientAction] deal_invites insert failed', inviteErr);
    } else if (inviteRow) {
      const inviteUrl = baseUrl + '/invite/' + (inviteRow as any).token;
      const [{ data: firm }, { data: realtor }] = await Promise.all([
        service.from('firms').select('name').eq('id', me!.firm_id).maybeSingle(),
        service
          .from('users')
          .select('full_name, email')
          .eq('id', me!.user_id)
          .maybeSingle(),
      ]);
      const firmName = (firm as any)?.name || 'Realtor Portal';
      const realtorName =
        (realtor as any)?.full_name ||
        (realtor as any)?.email ||
        'Your agent';
      const safeName = escapeHtml(fullName);
      const safeFirm = escapeHtml(firmName);
      const safeRealtor = escapeHtml(realtorName);
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;">
  <p style="margin:0 0 16px;">Hi ${safeName},</p>
  <p style="margin:0 0 16px;">${safeRealtor} at <strong>${safeFirm}</strong> invited you to your ${roleInDeal === 'seller' ? 'home sale' : 'home search'} on Realtor Portal - where you'll track listings, tours, documents, and messages in one place.</p>
  <p style="margin:24px 0;">
    <a href="${inviteUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;">Set up your account &rarr;</a>
  </p>
  <p style="margin:24px 0 0;color:#475569;">- ${safeFirm}</p>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;">If the button above doesn't work, paste this link into your browser: ${inviteUrl}</p>
</div>`.trim();
      const text = [
        `Hi ${fullName},`,
        '',
        `${realtorName} at ${firmName} invited you to your ${roleInDeal === 'seller' ? 'home sale' : 'home search'} on Realtor Portal.`,
        '',
        `Set up your account: ${inviteUrl}`,
        '',
        `- ${firmName}`,
      ].join('\n');
      await sendEmail({
        to: email,
        subject: `${realtorName} invited you to ${firmName} on Realtor Portal`,
        html,
        text,
        replyTo: (realtor as any)?.email || undefined,
      }).catch(() => {});
    }
  }

  if (wantDealNow && searchId) redirect('/dashboard/deals/' + searchId);
  // Otherwise land on the brand-new client's profile so the realtor can
  // immediately add a deal, log notes, etc.
  redirect('/dashboard/clients/' + clientId + '?welcome=1');
}
