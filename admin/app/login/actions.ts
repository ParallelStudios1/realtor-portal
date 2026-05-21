'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

export async function loginAction(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  const password = formData.get('password') as string | null;
  // Only honor internal paths so this can't be turned into an open redirect.
  const rawNext = (formData.get('next') as string | null) || '/dashboard';
  const next = rawNext.startsWith('/') ? rawNext : '/dashboard';

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email and password required.'));
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  redirect(next);
}

export async function logoutAction() {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
