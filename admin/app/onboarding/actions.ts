'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Save firm branding (onboarding "Save & continue").
 *
 * Uses the proven server-action pattern - getMe() for auth + the service-role
 * client for the write - instead of constructing a user-scoped SSR client and
 * calling auth.getUser() inline. The old version stalled here during onboarding
 * (the firm was created but onboarding_completed never flipped, and the page
 * hung before reaching /dashboard). getMe() + service-role is what every other
 * server action in the app uses and is reliable.
 */
export async function saveBrandingAction(fd: FormData) {
  const me = await getMe();
  if (!me?.user_id) return { error: 'Not signed in.' };

  const firmId = fd.get('firm_id') as string;
  const name = (fd.get('name') as string)?.trim();
  const tagline = (fd.get('tagline') as string)?.trim() || null;
  const brandColor = (fd.get('brand_color') as string)?.trim() || '#0F172A';
  const accentColor = (fd.get('accent_color') as string)?.trim() || '#2563EB';
  const contactEmail = (fd.get('contact_email') as string)?.trim() || null;
  const contactPhone = (fd.get('contact_phone') as string)?.trim() || null;
  const websiteUrl = (fd.get('website_url') as string)?.trim() || null;
  const logo = fd.get('logo') as File | null;

  if (!firmId || !name) return { error: 'Missing firm name.' };

  // Authorize: the caller must be an admin/owner of this exact firm.
  if (
    me.firm_id !== firmId ||
    !['firm_admin', 'owner', 'super_admin'].includes(me.role || '')
  ) {
    return { error: 'You are not allowed to edit this firm.' };
  }

  const service = getSupabaseServiceRoleClient();

  let logoUrl: string | null = null;
  if (logo && logo.size > 0) {
    await service.storage
      .createBucket('firm-assets', { public: true })
      .catch(() => {});

    const ext = logo.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${firmId}/logo-${Date.now()}.${ext}`;
    const buf = Buffer.from(await logo.arrayBuffer());
    const { error: upErr } = await service.storage
      .from('firm-assets')
      .upload(path, buf, { contentType: logo.type, upsert: true });
    if (upErr) return { error: 'Logo upload failed: ' + upErr.message };

    const { data: pub } = service.storage
      .from('firm-assets')
      .getPublicUrl(path);
    logoUrl = pub.publicUrl;
  }

  const update: Record<string, unknown> = {
    name,
    tagline,
    brand_color: brandColor,
    accent_color: accentColor,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    website_url: websiteUrl,
    onboarding_completed: true,
  };
  if (logoUrl) update.logo_url = logoUrl;

  const { error } = await service.from('firms').update(update).eq('id', firmId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}
