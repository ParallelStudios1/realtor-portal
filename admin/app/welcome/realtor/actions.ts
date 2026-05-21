'use server';

import { redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Finish onboarding for a cross-firm realtor who just clicked their
 * magic-link invite. Creates a free-trial firm for them + their
 * public.users row, then forwards to the deal they were invited to.
 *
 * Idempotent: if they already have a public.users row + firm, we just
 * redirect onward.
 */
export async function completeRealtorOnboardingAction(formData: FormData) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const fullName = (formData.get('full_name') as string | null)?.trim();
  const firmName = (formData.get('firm_name') as string | null)?.trim();
  const rawNext = (formData.get('next') as string | null) || '/dashboard';
  const next = rawNext.startsWith('/') ? rawNext : '/dashboard';

  if (!fullName || !firmName) {
    redirect(
      '/welcome/realtor?error=' +
        encodeURIComponent('Name and firm name are required.') +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  const service = getSupabaseServiceRoleClient();

  // If they already have a public.users row, skip the firm-create dance.
  const { data: existing } = await service
    .from('users')
    .select('id, firm_id')
    .eq('id', user.id)
    .maybeSingle();

  if (existing?.firm_id) {
    redirect(next);
  }

  // Create their firm with a free-trial status. They can upgrade later.
  // Slug is derived from firm name; we collision-check up to a few times.
  const slugBase = firmName!
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

  const { data: firm, error: firmErr } = await service
    .from('firms')
    .insert({
      name: firmName,
      slug,
      status: 'trial',
    })
    .select('id')
    .single();
  if (firmErr || !firm) {
    redirect(
      '/welcome/realtor?error=' +
        encodeURIComponent('Could not create firm: ' + (firmErr?.message || '')) +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  // Their public.users row. role = firm_admin so they get the full action
  // grid on their own deals. On the guest deal they were invited to,
  // can_collab_on_search already grants them realtor-level RLS access.
  const { error: userErr } = await service.from('users').upsert(
    {
      id: user.id,
      firm_id: firm!.id,
      email: user.email!,
      full_name: fullName,
      role: 'firm_admin',
    },
    { onConflict: 'id' }
  );
  if (userErr) {
    redirect(
      '/welcome/realtor?error=' +
        encodeURIComponent('Could not save your profile: ' + userErr.message) +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  redirect(next);
}
