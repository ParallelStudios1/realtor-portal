import { notFound } from 'next/navigation';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { InviteClient } from './InviteClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: "You've been invited · Realtor Portal" };

/**
 * /invite/[token] - the canonical "you've been invited" landing.
 *
 * This page does NOT require auth. It resolves the invite token via the
 * service role, fetches host-firm branding, and renders a role-aware
 * splash that explains who invited the recipient, what role they're
 * being asked to take, and what they need to do next.
 *
 * The form branches by:
 *   - role: 'realtor' / 'co_realtor' / 'attorney' / 'buyer' / 'seller' /
 *           'inspector' / 'lender' / 'mortgage_broker' / 'other'
 *   - whether the recipient already has an account (email match in users)
 *
 * After form submit (handled in actions.ts → acceptInviteAction):
 *   - existing user → sign in via Supabase OTP, route to deal
 *   - new realtor / co_realtor → create their own firm + user row, then deal
 *   - new attorney → attach to host firm as role=attorney, then attorney dash
 *   - new client (buyer/seller) → attach to host firm as role=client, then deal
 *   - new other party → create a minimal user, then deal
 */
export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const service = getSupabaseServiceRoleClient();

  const { data: invite } = await service
    .from('deal_invites')
    .select(
      `id, token, role, name, email, phone, expires_at, accepted_at,
       search_id, firm_id, created_by,
       firm:firms ( name, brand_color, accent_color, logo_url, tagline ),
       search:client_searches ( id, name, kind, phase,
         realtor:users!client_searches_realtor_id_fkey ( full_name, email ),
         client:users!client_searches_client_id_fkey ( id, full_name, email ) )`
    )
    .eq('token', params.token)
    .maybeSingle();

  if (!invite) notFound();

  const expired =
    !!(invite as any).expires_at &&
    new Date((invite as any).expires_at).getTime() < Date.now();

  // Look up whether an account already exists for this email - so the
  // client component can show "Sign in to accept" vs the role-specific
  // signup form. We don't reveal the user_id; just a boolean.
  let hasAccount = false;
  if ((invite as any).email) {
    const { data: existing } = await service
      .from('users')
      .select('id')
      .ilike('email', (invite as any).email)
      .maybeSingle();
    hasAccount = !!existing;
  }

  // If the visitor is already authenticated and the emails match, just
  // route them straight to the deal - they already have the access they
  // need via deal_participants + the can_collab_on_search RLS function.
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const alreadySignedInAsRecipient =
    user &&
    (invite as any).email &&
    user.email &&
    user.email.toLowerCase() === ((invite as any).email as string).toLowerCase();

  return (
    <InviteClient
      invite={invite as any}
      expired={expired}
      hasAccount={hasAccount}
      alreadySignedInAsRecipient={!!alreadySignedInAsRecipient}
    />
  );
}
