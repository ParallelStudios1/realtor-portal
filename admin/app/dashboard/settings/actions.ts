'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Update the signed-in user's full_name. RLS limits the update to their own
 * row (id = auth.uid()), so we don't need to scope by hand.
 */
export async function saveProfileAction(fd: FormData) {
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

  revalidatePath('/dashboard/settings');
  return { ok: true };
}

/**
 * Change the signed-in user's password. Reauthenticates with the current
 * password first so a stolen session can't silently rotate the password.
 */
export async function changePasswordAction(fd: FormData) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not signed in.' };

  const currentPw = fd.get('current_password') as string | null;
  const newPw = fd.get('new_password') as string | null;
  const confirmPw = fd.get('confirm_password') as string | null;

  if (!currentPw || !newPw || !confirmPw) return { error: 'All fields required.' };
  if (newPw.length < 8) return { error: 'New password must be at least 8 characters.' };
  if (newPw !== confirmPw) return { error: 'New passwords don’t match.' };

  // Verify current password by re-signing in. Supabase JS doesn't expose a
  // dedicated "verify password" call.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPw,
  });
  if (reauthError) return { error: 'Current password didn’t match.' };

  const { error } = await supabase.auth.updateUser({ password: newPw });
  if (error) return { error: error.message };

  return { ok: true };
}

/**
 * Update firm-level settings — name, branding, contact info. Only firm_admins
 * can update their firm's row (enforced by RLS). We also pass firm_id from
 * the form so we don't depend on a join.
 */
export async function saveFirmAction(fd: FormData) {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const firmId = (fd.get('firm_id') as string | null)?.trim();
  if (!firmId) return { error: 'Missing firm.' };

  const name = (fd.get('name') as string | null)?.trim();
  const tagline = (fd.get('tagline') as string | null)?.trim() || null;
  const brandColor = (fd.get('brand_color') as string | null)?.trim() || '#0F172A';
  const accentColor = (fd.get('accent_color') as string | null)?.trim() || '#2563EB';
  const contactEmail = (fd.get('contact_email') as string | null)?.trim() || null;
  const contactPhone = (fd.get('contact_phone') as string | null)?.trim() || null;

  if (!name) return { error: 'Firm name is required.' };
  if (!HEX_RE.test(brandColor)) return { error: 'Brand color must be a hex value (e.g. #1F6FEB).' };
  if (!HEX_RE.test(accentColor)) return { error: 'Accent color must be a hex value (e.g. #1F6FEB).' };

  const { error } = await supabase
    .from('firms')
    .update({
      name,
      tagline,
      brand_color: brandColor,
      accent_color: accentColor,
      contact_email: contactEmail,
      contact_phone: contactPhone,
    })
    .eq('id', firmId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/branding');
  return { ok: true };
}
