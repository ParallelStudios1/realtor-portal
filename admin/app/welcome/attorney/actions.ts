'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Complete attorney onboarding. Creates their public.users row with
 * role='attorney' linked to the inviting firm (host_firm). After this
 * they have RLS access to that firm's deals as an attorney.
 *
 * Idempotent — re-running just routes them on.
 */
export async function completeAttorneyOnboardingAction(formData: FormData) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const fullName = (formData.get('full_name') as string | null)?.trim();
  const firmIdRaw = (formData.get('host_firm') as string | null)?.trim();
  const rawNext = (formData.get('next') as string | null) || '/attorney';
  const next = rawNext.startsWith('/') ? rawNext : '/attorney';

  if (!fullName) {
    redirect(
      '/welcome/attorney?error=' +
        encodeURIComponent('Name is required.') +
        '&next=' +
        encodeURIComponent(next) +
        (firmIdRaw ? '&host_firm=' + encodeURIComponent(firmIdRaw) : '')
    );
  }

  const service = getSupabaseServiceRoleClient();

  const { data: existing } = await service
    .from('users')
    .select('id, firm_id')
    .eq('id', user.id)
    .maybeSingle();

  if (existing?.firm_id) {
    redirect(next);
  }

  // Attach the attorney to the inviting firm. If we somehow lost the
  // host_firm hint, fall back to looking it up from their auth metadata.
  let firmId = firmIdRaw || null;
  if (!firmId) {
    const meta = (user.user_metadata || {}) as Record<string, any>;
    if (typeof meta.invited_by_firm === 'string') firmId = meta.invited_by_firm;
  }
  if (!firmId) {
    redirect(
      '/welcome/attorney?error=' +
        encodeURIComponent('Missing host firm. Ask your realtor to re-invite.') +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  const { error: userErr } = await service.from('users').upsert(
    {
      id: user.id,
      firm_id: firmId,
      email: user.email!,
      full_name: fullName,
      role: 'attorney',
    },
    { onConflict: 'id' }
  );
  if (userErr) {
    redirect(
      '/welcome/attorney?error=' +
        encodeURIComponent('Could not save your profile: ' + userErr.message) +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  redirect(next);
}
