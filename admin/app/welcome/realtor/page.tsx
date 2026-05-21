import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { OnboardClient } from './OnboardClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome — set up your account' };

/**
 * Cross-firm realtor onboarding landing.
 *
 * Triggered when an external realtor is invited to a deal. They get a
 * Supabase magic link in SMS/email; the link goes here.
 *
 *   1. Supabase has already authenticated them (the magic link creates an
 *      auth.users row + sets the cookie).
 *   2. We bootstrap their public.users row + a firm of their own (free
 *      trial) so they have a place to land outside this one shared deal.
 *   3. We send them onward to `?next=/deal/<id>` so they land directly on
 *      the deal they were invited to.
 *
 * If they already have a public.users row + firm, we just route them on —
 * no double-onboarding.
 */
export default async function WelcomeRealtorPage({
  searchParams,
}: {
  searchParams: { next?: string; host_firm?: string; deal?: string };
}) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session — magic link expired or someone hit this directly. Bounce
  // them to /login with the original next path preserved so they can
  // password-sign-in instead.
  if (!user) {
    const next =
      typeof searchParams.next === 'string' && searchParams.next.startsWith('/')
        ? searchParams.next
        : '/dashboard';
    redirect('/login?next=' + encodeURIComponent(next));
  }

  // Sanitize `next` — only allow internal paths.
  const next =
    typeof searchParams.next === 'string' && searchParams.next.startsWith('/')
      ? searchParams.next
      : '/dashboard';

  const service = getSupabaseServiceRoleClient();
  const { data: existing } = await service
    .from('users')
    .select('id, firm_id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  // Already onboarded: skip the form and route them onward.
  if (existing?.firm_id) {
    redirect(next);
  }

  // Pull a friendly first name from user_metadata (Supabase keeps whatever
  // we passed in inviteUserByEmail there) and a sensible default firm name
  // from the email domain — they can edit before submitting.
  const meta = (user.user_metadata || {}) as Record<string, any>;
  const fullName: string =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (user.email ? user.email.split('@')[0] : '') ||
    '';
  const emailDomain = user.email?.split('@')[1] || '';
  const suggestedFirmName =
    (typeof meta.firm_name === 'string' && meta.firm_name) ||
    (emailDomain
      ? emailDomain
          .replace(/\.(com|net|io|co|org|us|llc|biz|info)$/i, '')
          .split('.')
          .pop()!
          .replace(/^./, (c) => c.toUpperCase()) + ' Real Estate'
      : '');

  // Get the inviting firm's name so we can label the page nicely.
  let hostFirmName: string | null = null;
  if (searchParams.host_firm) {
    const { data: hostFirm } = await service
      .from('firms')
      .select('name')
      .eq('id', searchParams.host_firm)
      .maybeSingle();
    hostFirmName = (hostFirm as any)?.name ?? null;
  }

  return (
    <OnboardClient
      email={user.email!}
      defaultFullName={fullName}
      defaultFirmName={suggestedFirmName}
      hostFirmName={hostFirmName}
      next={next}
    />
  );
}
