'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseServerClient } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * Save firm branding. Uses service-role for the storage upload (so a single
 * RLS policy doesn't have to know about every nuance of multipart uploads),
 * but writes the firms row through the user's auth context so RLS verifies
 * they're a firm_admin of that firm.
 */
export async function saveBrandingAction(fd: FormData) {
  const userClient = getSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

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

  let logoUrl: string | null = null;
  if (logo && logo.size > 0) {
    const service = getSupabaseServiceRoleClient();

    // Make sure the bucket exists (idempotent)
    await service.storage.createBucket('firm-assets', { public: true }).catch(() => {});

    const ext = logo.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${firmId}/logo-${Date.now()}.${ext}`;
    const buf = Buffer.from(await logo.arrayBuffer());
    const { error: upErr } = await service.storage
      .from('firm-assets')
      .upload(path, buf, { contentType: logo.type, upsert: true });
    if (upErr) return { error: 'Logo upload failed: ' + upErr.message };

    const { data: pub } = service.storage.from('firm-assets').getPublicUrl(path);
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

  const { error } = await userClient.from('firms').update(update).eq('id', firmId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}
