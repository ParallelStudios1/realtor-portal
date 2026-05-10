'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

/**
 * Update the signed-in client's full_name. RLS limits the update to their
 * own row.
 */
export async function saveClientProfileAction(fd: FormData) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const fullName = (fd.get('full_name') as string | null)?.trim();
  if (!fullName) return { error: 'Name is required.' };

  const { error } = await supabase
    .from('users')
    .update({ full_name: fullName })
    .eq('id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/client/profile');
  revalidatePath('/client');
  return { ok: true };
}

/**
 * Change the signed-in user's password. Reauths with the current password
 * before rotating.
 */
export async function changeClientPasswordAction(fd: FormData) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not signed in.' };

  const currentPw = fd.get('current_password') as string | null;
  const newPw = fd.get('new_password') as string | null;
  const confirmPw = fd.get('confirm_password') as string | null;

  if (!currentPw || !newPw || !confirmPw) return { error: 'All fields required.' };
  if (newPw.length < 8) return { error: 'New password must be at least 8 characters.' };
  if (newPw !== confirmPw) return { error: 'New passwords don’t match.' };

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPw,
  });
  if (reauthError) return { error: 'Current password didn’t match.' };

  const { error } = await supabase.auth.updateUser({ password: newPw });
  if (error) return { error: error.message };

  return { ok: true };
}
