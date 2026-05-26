'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

/**
 * Role-aware signup that goes through /api/auth/signup so email-confirmation
 * never blocks the flow. The API admin-creates the user with email_confirm=true
 * and runs the firm/client setup server-side. Then we sign the user in here
 * to set the cookies, and redirect to the right home.
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
  // `next` comes from cross-firm invite links (/signup?next=/deal/<id>).
  // Sanitize to internal paths only so this can't be turned into an
  // open redirect by tampering with the URL.
  const rawNext = (formData.get('next') as string | null)?.trim();
  const next = rawNext && rawNext.startsWith('/') ? rawNext : null;

  const back = (msg: string) =>
    redirect(
      '/signup?error=' +
        encodeURIComponent(msg) +
        (role ? '&role=' + role : '') +
        (email ? '&email=' + encodeURIComponent(email) : '') +
        (next ? '&next=' + encodeURIComponent(next) : '')
    );

  if (!role || !['realtor', 'buyer', 'seller'].includes(role)) {
    back("Please pick whether you're a Realtor, Buyer, or Seller.");
    return;
  }
  if (!fullName || !email || !password) back('Fill in every field.');
  if (password!.length < 8) back('Password must be at least 8 characters.');
  if (role === 'realtor' && !firmName) back('Firm name is required.');
  if ((role === 'buyer' || role === 'seller') && !realtorEmail)
    back("Your realtor's email is required.");

  // Talk to our own API. We can't relative-fetch in a server action without
  // a base URL, so use the env-configured site URL.
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtor-portal-ten.vercel.app';
  const r = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      role,
      full_name: fullName,
      email,
      password,
      firm_name: role === 'realtor' ? firmName : undefined,
      realtor_email:
        role === 'buyer' || role === 'seller' ? realtorEmail : undefined,
    }),
    cache: 'no-store',
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json?.ok) {
    back(json?.error || `Signup failed (HTTP ${r.status}).`);
  }

  // Sign in here so the response carries the auth cookies for the redirect.
  const supabase = getSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (signInError) back('Account created but sign-in failed: ' + signInError.message);

  // Give the auth cookie a beat to land before we redirect — otherwise the
  // next SSR render can race the cookie write, getMe() returns null, and
  // pages 404 on first hit after firm signup.
  await new Promise((r) => setTimeout(r, 300));

  // If they came in via a cross-firm invite link, drop them straight onto
  // the deal. Otherwise fall back to the role's default landing.
  redirect(next ?? (role === 'realtor' ? '/onboarding' : '/client'));
}
