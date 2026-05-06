import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { WelcomeClient } from './WelcomeClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome' };

/**
 * Branded landing page after a client clicks "Accept invitation" in their email.
 *
 * Supabase verifies the invite token, sets the auth cookies, and redirects
 * here. We:
 *   1. Read the user's firm_id from auth.users metadata (set when invited)
 *   2. Fetch firm branding (logo, brand_color, name)
 *   3. Render a fully-branded welcome screen
 *   4. Let them set a password, then deep-link into the mobile app
 *
 * If they hit /welcome without a session (e.g. invite link expired or they
 * came directly), we still show the firm branding when ?firm_id is present.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { firm_id?: string };
}) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let firmId: string | null = null;
  let userEmail: string | null = null;
  let userFullName: string | null = null;

  if (user) {
    userEmail = user.email ?? null;
    // Pull firm_id from Supabase user metadata (we set this when inviting)
    firmId =
      (user.user_metadata?.firm_id as string | undefined) ??
      (user.app_metadata?.firm_id as string | undefined) ??
      null;
    userFullName =
      (user.user_metadata?.full_name as string | undefined) ?? null;
  }

  // Fall back to ?firm_id query param if no session yet (e.g. token expired)
  if (!firmId && searchParams.firm_id) {
    firmId = searchParams.firm_id;
  }

  // Fetch firm branding via service role (welcome page is unauthenticated for
  // un-invited users, and we want public read of branding).
  let firm: {
    name: string;
    logo_url: string | null;
    brand_color: string | null;
    accent_color: string | null;
    tagline: string | null;
  } | null = null;

  if (firmId) {
    const service = getSupabaseServiceRoleClient();
    const { data } = await service
      .from('firms')
      .select('name, logo_url, brand_color, accent_color, tagline')
      .eq('id', firmId)
      .single();
    firm = data;
  }

  return (
    <WelcomeClient
      firm={firm}
      hasSession={Boolean(user)}
      email={userEmail}
      fullName={userFullName}
    />
  );
}
