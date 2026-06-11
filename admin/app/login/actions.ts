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
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message));
  }

  // When no explicit destination was requested, send each role straight to
  // its own home. (Server-action redirects skip the middleware hop, so a
  // client signing in used to land on /dashboard's URL showing /client's
  // content.)
  let dest = next;
  if (next === '/dashboard' && data?.user) {
    const { data: row } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();
    const role = (row?.role as string) || null;
    dest =
      role === 'client' ? '/client' : role === 'attorney' ? '/attorney' : next;
  }

  redirect(dest);
}

export async function logoutAction() {
  const supabase = getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}
