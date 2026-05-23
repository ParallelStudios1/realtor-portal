'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Accept an invite. Branches by role and existing-account state.
 *
 * Common contract:
 *   - token: deal_invites.token (uuid string)
 *   - password (for new accounts that need one — clients + realtors)
 *   - any role-specific fields: full_name, firm_name, etc.
 *
 * After:
 *   - upserts public.users with the right role + firm_id
 *   - signs the recipient in (cookie session)
 *   - marks the invite accepted
 *   - redirects to the right post-accept landing (deal, attorney dash)
 */
export async function acceptInviteAction(formData: FormData) {
  const token = (formData.get('token') as string | null)?.trim();
  if (!token) redirect('/');

  const service = getSupabaseServiceRoleClient();
  const { data: invite } = await service
    .from('deal_invites')
    .select(
      'id, token, role, name, email, phone, search_id, firm_id, expires_at, accepted_at'
    )
    .eq('token', token)
    .maybeSingle();
  if (!invite) redirect('/');

  const inv = invite as any;
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    redirect('/invite/' + token + '?error=expired');
  }

  const fullName =
    ((formData.get('full_name') as string | null) || inv.name || '').trim();
  const firmName = ((formData.get('firm_name') as string | null) || '').trim();
  const password = (formData.get('password') as string | null) || '';
  // The recipient confirms their email so we can attach to an account
  // (the realtor may have typed a typo when adding them).
  const email = (
    (formData.get('email') as string | null) ||
    inv.email ||
    ''
  )
    .trim()
    .toLowerCase();

  if (!email) {
    redirect('/invite/' + token + '?error=missing_email');
  }
  if (!fullName) {
    redirect('/invite/' + token + '?error=missing_name');
  }

  const role = (inv.role as string) || 'other';
  const isRealtor = role === 'realtor' || role === 'co_realtor';
  const isAttorney = role === 'attorney';
  const isClient = role === 'buyer' || role === 'seller';

  // 1. Find or create the auth.users row.
  let authUserId: string | null = null;
  const { data: list } = await service.auth.admin.listUsers();
  const existing = list?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    authUserId = existing.id;
    // Make sure email is confirmed so password login works without a
    // dance.
    await service.auth.admin
      .updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata || {}),
          full_name: fullName,
        },
      })
      .catch(() => {});
    if (password && password.length >= 8) {
      // They're using this form to also set a password — honor it.
      await service.auth.admin
        .updateUserById(existing.id, { password })
        .catch(() => {});
    }
  } else {
    // New account. Realtors + clients need a password; attorneys and
    // "other" roles can also set one if they typed it.
    if (!password || password.length < 8) {
      redirect('/invite/' + token + '?error=password_required');
    }
    const { data: created, error: createErr } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role },
      });
    if (createErr || !created?.user?.id) {
      redirect(
        '/invite/' +
          token +
          '?error=' +
          encodeURIComponent('Could not create account: ' + (createErr?.message || ''))
      );
    }
    authUserId = created!.user!.id;
  }

  // 2. Create/upsert their public.users row with the right firm_id + role.
  if (isRealtor) {
    // Realtors get their own firm — they are NOT a member of the host firm.
    // If they already have a public.users row, leave their firm alone.
    const { data: existingRow } = await service
      .from('users')
      .select('id, firm_id')
      .eq('id', authUserId)
      .maybeSingle();
    if (!existingRow?.firm_id) {
      // Spin up a new firm in trial. Slug derived from firmName or email.
      const slugBase = (firmName || email.split('@')[0] || 'firm')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      let slug = slugBase || 'firm';
      for (let i = 0; i < 5; i++) {
        const { data: clash } = await service
          .from('firms')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
      }
      const { data: firm } = await service
        .from('firms')
        .insert({
          name:
            firmName ||
            fullName.split(' ').slice(-1).join(' ') + ' Real Estate',
          slug,
          status: 'trial',
        })
        .select('id')
        .single();
      if (!firm) {
        redirect('/invite/' + token + '?error=firm_create_failed');
      }
      await service.from('users').upsert(
        {
          id: authUserId,
          firm_id: (firm as any).id,
          email,
          full_name: fullName,
          role: 'firm_admin',
        },
        { onConflict: 'id' }
      );
    }
  } else if (isAttorney) {
    // Attorneys join the host firm with role=attorney.
    await service.from('users').upsert(
      {
        id: authUserId,
        firm_id: inv.firm_id,
        email,
        full_name: fullName,
        role: 'attorney',
      },
      { onConflict: 'id' }
    );
  } else if (isClient) {
    // Buyer/seller clients join the host firm with role=client.
    await service.from('users').upsert(
      {
        id: authUserId,
        firm_id: inv.firm_id,
        email,
        full_name: fullName,
        role: 'client',
      },
      { onConflict: 'id' }
    );
    // Link the deal's principal client if it's vacant.
    await service
      .from('client_searches')
      .update({ client_id: authUserId })
      .eq('id', inv.search_id)
      .is('client_id', null)
      .then(
        () => null,
        () => null
      );
  } else {
    // Inspector / lender / mortgage broker / "other" — give them a
    // minimal user row attached to the host firm with role='client' so
    // RLS treats them as a deal participant. They primarily access via
    // the deal_participants row, not their own firm.
    await service.from('users').upsert(
      {
        id: authUserId,
        firm_id: inv.firm_id,
        email,
        full_name: fullName,
        role: 'client',
      },
      { onConflict: 'id' }
    );
  }

  // 3. Backfill deal_participants.user_id so RLS lookups by auth.uid()
  //    work (in addition to the existing email-match path).
  if (inv.participant_id) {
    await service
      .from('deal_participants')
      .update({ user_id: authUserId })
      .eq('id', inv.participant_id);
  }

  // 4. Mark the invite accepted.
  await service
    .from('deal_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: authUserId })
    .eq('token', token);

  // 5. Sign them in via password so the response sets the auth cookies.
  const supabase = getSupabaseServerClient();
  const finalPassword = password || (await ensurePassword(authUserId!, service));
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: finalPassword,
  });
  if (signInError) {
    // They have an account but no password — send them to /login with a
    // helpful preset rather than dropping a hard error.
    redirect(
      '/login?next=' +
        encodeURIComponent(
          isAttorney
            ? '/attorney'
            : isClient
              ? '/client'
              : '/dashboard/deals/' + inv.search_id
        ) +
        '&notice=' +
        encodeURIComponent('Use your existing password to sign in.')
    );
  }

  // 6. Route by role to the right post-accept landing.
  if (isAttorney) {
    redirect('/attorney');
  }
  if (isClient) {
    redirect('/client');
  }
  if (isRealtor) {
    redirect('/dashboard/deals/' + inv.search_id);
  }
  // Default: send them to the deal.
  redirect('/deal/' + inv.search_id);
}

/**
 * Ensures the user has a password we can sign them in with. If their
 * row was created via admin invite without a password, set one we know
 * (random 32-char), so the subsequent signInWithPassword works.
 * This is a fallback path used only when the form didn't provide one.
 */
async function ensurePassword(userId: string, service: any): Promise<string> {
  const random =
    'rp_' +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);
  await service.auth.admin
    .updateUserById(userId, { password: random })
    .catch(() => {});
  return random;
}
