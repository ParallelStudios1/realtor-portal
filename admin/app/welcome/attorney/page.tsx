import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { AttorneyOnboardClient } from './OnboardClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome — set up your attorney account' };

/**
 * Attorney onboarding landing — analogous to /welcome/realtor.
 *
 * When the realtor adds an attorney as a party, we use Supabase
 * inviteUserByEmail with metadata.role='attorney' + redirectTo this page.
 * The magic link logs them in; this page creates their public.users row
 * with role='attorney', tied to the host firm (no separate firm for
 * attorneys — they hang off whoever invited them and can be added to
 * multiple firms over time via deal_participants).
 *
 * After onboarding they're routed to /attorney/deals/<id> which is their
 * existing deal-detail screen.
 */
export default async function WelcomeAttorneyPage({
  searchParams,
}: {
  searchParams: { next?: string; host_firm?: string };
}) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const next =
    typeof searchParams.next === 'string' && searchParams.next.startsWith('/')
      ? searchParams.next
      : '/attorney';

  if (!user) {
    redirect('/login?next=' + encodeURIComponent(next));
  }

  const service = getSupabaseServiceRoleClient();
  const { data: existing } = await service
    .from('users')
    .select('id, firm_id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (existing?.firm_id) {
    redirect(next);
  }

  const meta = (user.user_metadata || {}) as Record<string, any>;
  const fullName: string =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (user.email ? user.email.split('@')[0] : '') ||
    '';

  let hostFirmName: string | null = null;
  let hostFirmId: string | null = searchParams.host_firm ?? null;
  if (hostFirmId) {
    const { data: hostFirm } = await service
      .from('firms')
      .select('name')
      .eq('id', hostFirmId)
      .maybeSingle();
    hostFirmName = (hostFirm as any)?.name ?? null;
  }

  return (
    <AttorneyOnboardClient
      email={user.email!}
      defaultFullName={fullName}
      hostFirmName={hostFirmName}
      hostFirmId={hostFirmId}
      next={next}
    />
  );
}
