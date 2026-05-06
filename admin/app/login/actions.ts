'use server';

import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

export async function loginAction(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  const password = formData.get('password') as string | null;
  const next = (formData.get('next') as string | null) || '/dashboard';

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
