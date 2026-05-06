'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

/**
 * Server Action: handles the self-serve signup form.
 *
 * 1. Creates a Supabase auth user with email + password
 * 2. Signs that user in (returns a session, sets cookies)
 * 3. Calls the create_firm_and_admin RPC, which atomically creates the
 *    firms row and the public.users row with role=firm_admin
 * 4. Redirects to /onboarding
 *
 * If signup fails, redirects back to /signup?error=...
 */
export async function signupAction(formData: FormData) {
  const firmName = (formData.get('firm_name') as string | null)?.trim();
  const fullName = (formData.get('full_name') as string | null)?.trim();
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  const password = formData.get('password') as string | null;

  if (!firmName || !fullName || !email || !password) {
    redirect('/signup?error=' + encodeURIComponent('Please fill in every field.'));
  }
  if (password.length < 8) {
    redirect('/signup?error=' + encodeURIComponent('Password must be at least 8 characters.'));
  }

  const supabase = getSupabaseServerClient();

  // Step 1+2: signUp with auto-confirm via email confirmation off in Supabase
  // Auth settings (we'll guide the user to disable email confirmation in
  // the Supabase dashboard for now; once we're paid we wire up Resend SMTP).
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (authError) {
    redirect('/signup?error=' + encodeURIComponent(authError.message));
  }

  // If email confirmation is required, the user has no session yet — show a
  // friendly message. Most setups auto-confirm so we can proceed.
  if (!authData.session) {
    redirect(
      '/login?notice=' +
        encodeURIComponent('Check your email to confirm your account, then sign in.')
    );
  }

  // Step 3: atomic firm + user row creation
  const { error: rpcError } = await supabase.rpc('create_firm_and_admin', {
    p_firm_name: firmName,
    p_full_name: fullName,
  });

  if (rpcError) {
    redirect(
      '/signup?error=' +
        encodeURIComponent('Account created but firm setup failed: ' + rpcError.message)
    );
  }

  // Step 4: off to onboarding wizard
  redirect('/onboarding');
}
