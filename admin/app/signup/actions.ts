'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

/**
 * Role-aware self-serve signup.
 *
 * 1. Creates a Supabase auth user
 * 2. Signs them in (cookies)
 * 3. Calls the right RPC for their role:
 *    - realtor → create_firm_and_admin (creates firm + firm_admin user row)
 *    - buyer/seller → create_client_user (looks up realtor's firm, creates
 *      client user row + starter search)
 * 4. Redirects to /onboarding (realtor) or /client (buyer/seller)
 *
 * If anything fails, redirects back to /signup with a readable error.
 */
export async function signupAction(formData: FormData) {
  const role = (formData.get('role') as string | null)?.trim();
  const fullName = (formData.get('full_name') as string | null)?.trim();
  const email = (formData.get('email') as string | null)
    ?.trim()
    .toLowerCase();
  const password = formData.get('password') as string | null;
  const firmName = (formData.get('firm_name') as string | null)?.trim();
  const realtorEmail = (formData.get('realtor_email') as string | null)
    ?.trim()
    .toLowerCase();

  const back = (msg: string) =>
    redirect(
      '/signup?error=' +
        encodeURIComponent(msg) +
        (role ? '&role=' + role : '')
    );

  if (!role || !['realtor', 'buyer', 'seller'].includes(role)) {
    back('Please pick whether you\'re a Realtor, Buyer, or Seller.');
    return;
  }
  if (!fullName || !email || !password) back('Fill in every field.');
  if (password!.length < 8) back('Password must be at least 8 characters.');
  if (role === 'realtor' && !firmName) back('Firm name is required.');
  if ((role === 'buyer' || role === 'seller') && !realtorEmail)
    back("Your realtor's email is required.");

  const supabase = getSupabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: email!,
    password: password!,
    options: { data: { full_name: fullName } },
  });
  if (authError) back(authError.message);

  if (!authData?.session) {
    redirect(
      '/login?notice=' +
        encodeURIComponent(
          'Check your email to confirm your account, then sign in.'
        )
    );
  }

  if (role === 'realtor') {
    const { error: rpcError } = await supabase.rpc('create_firm_and_admin', {
      p_firm_name: firmName!,
      p_full_name: fullName!,
    });
    if (rpcError) back('Account created but firm setup failed: ' + rpcError.message);
    redirect('/onboarding');
  }

  // Buyer or Seller path
  const { error: rpcError } = await supabase.rpc('create_client_user', {
    p_realtor_email: realtorEmail!,
    p_full_name: fullName!,
    p_kind: role,
  });
  if (rpcError) {
    if (rpcError.message?.includes('realtor_not_found')) {
      back(
        "We couldn't find a realtor with that email. Double-check it, or ask them to send you an invite."
      );
    }
    back(rpcError.message);
  }
  redirect('/client');
}
