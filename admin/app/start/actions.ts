'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

/**
 * Ad-landing signup. Same machinery as /signup but tuned for a cold visitor
 * from an ad on a phone, probably inside Instagram's in-app browser:
 *
 *   - Only 3 fields (name / email / password). The firm or practice name is
 *     derived from their name so the form stays short; they can rename it in
 *     Settings at any time.
 *   - On success we sign them in (cookies) and land on /start?done=1, which
 *     pushes them to the app store. The account exists BEFORE we ask them to
 *     install anything, so a lost store hand-off no longer loses the person.
 */
export async function startSignupAction(formData: FormData) {
  const role = (formData.get('role') as string | null)?.trim() || 'realtor';
  const fullName = (formData.get('full_name') as string | null)?.trim();
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  const password = formData.get('password') as string | null;

  const back = (msg: string) =>
    redirect(
      '/start?error=' +
        encodeURIComponent(msg) +
        '&role=' +
        role +
        (email ? '&email=' + encodeURIComponent(email) : '') +
        (fullName ? '&name=' + encodeURIComponent(fullName) : '')
    );

  if (role !== 'realtor' && role !== 'attorney') back('Pick Realtor or Attorney.');
  if (!fullName || !email || !password) back('Fill in every field.');
  if (password!.length < 8) back('Password must be at least 8 characters.');

  // Short form: derive the workspace name. First name keeps it human
  // ("Sarah's Team"), and Settings lets them rename it whenever.
  const first = fullName!.split(/\s+/)[0];
  const firmName =
    role === 'attorney' ? `${fullName} Law` : `${first}'s Team`;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtorportal.parallelstudios.co';
  const r = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, full_name: fullName, email, password, firm_name: firmName }),
    cache: 'no-store',
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.ok) {
    if ((json as any)?.existing) {
      redirect(
        '/login?email=' +
          encodeURIComponent(email!) +
          '&notice=' +
          encodeURIComponent('You already have an account - sign in and your work is waiting.')
      );
    }
    back(json?.error || `Signup failed (HTTP ${r.status}).`);
  }

  // Sign in so the response carries auth cookies.
  const supabase = getSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (signInError) back('Account created but sign-in failed: ' + signInError.message);

  // Let the cookie land before the next SSR render (same race as /signup).
  await new Promise((r) => setTimeout(r, 300));

  redirect('/start?done=1&r=' + role);
}
