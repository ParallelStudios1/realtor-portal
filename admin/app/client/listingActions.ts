'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

/**
 * SELLER self-service: the principal seller client adds the home they're
 * selling to their own listing deal, and can optionally attach related docs
 * (disclosures, survey, HOA papers, photos…) right when they create it.
 *
 * Authorized strictly: the caller must be the principal client of a SELLER
 * (kind='seller') deal. Files are uploaded with the service role into the
 * firm's private client-docs bucket and recorded as documents on the deal.
 */
export async function addSellerListingAction(fd: FormData) {
  const me = await getMe();
  if (!me?.user_id) return { ok: false as const, error: 'Not signed in.' };

  const service = getSupabaseServiceRoleClient();

  // Resolve the caller's most recent SELLER deal where they're the principal.
  const { data: deals } = await service
    .from('client_searches')
    .select('id, firm_id, kind, client_id')
    .eq('client_id', me.user_id)
    .eq('kind', 'seller')
    .order('created_at', { ascending: false })
    .limit(1);
  const deal = (deals || [])[0] as
    | { id: string; firm_id: string; kind: string; client_id: string }
    | undefined;
  if (!deal) {
    return {
      ok: false as const,
      error: 'No listing deal found for your account.',
    };
  }

  const address = (fd.get('address') as string)?.trim();
  if (!address) return { ok: false as const, error: 'Enter the address.' };
  const listPrice = (fd.get('list_price') as string)?.trim();
  const photoUrl = (fd.get('photo_url') as string)?.trim() || null;
  const beds = (fd.get('bedrooms') as string)?.trim();
  const baths = (fd.get('bathrooms') as string)?.trim();
  const sqft = (fd.get('square_feet') as string)?.trim();
  const notes = (fd.get('notes') as string)?.trim() || null;

  const { data: house, error: hErr } = await service
    .from('houses')
    .insert({
      firm_id: deal.firm_id,
      search_id: deal.id,
      address,
      list_price: listPrice ? Number(listPrice) : null,
      photo_url: photoUrl,
      bedrooms: beds ? Number(beds) : null,
      bathrooms: baths ? Number(baths) : null,
      square_feet: sqft ? Number(sqft) : null,
      notes,
      status: 'interested',
      listing_status: 'coming_soon',
    })
    .select('id')
    .single();
  if (hErr) return { ok: false as const, error: hErr.message };

  // Optional document attachments.
  const files = fd
    .getAll('docs')
    .filter((f): f is File => f instanceof File && f.size > 0);
  let uploaded = 0;
  for (const file of files) {
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const path = `${deal.firm_id}/${deal.id}/${Date.now()}-${encodeURIComponent(
        file.name
      )}`;
      const buf = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await service.storage
        .from('client-docs')
        .upload(path, buf, { contentType: file.type || undefined, upsert: false });
      if (upErr) continue;
      await service.from('documents').insert({
        firm_id: deal.firm_id,
        search_id: deal.id,
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size: file.size || null,
        folder: 'Listing',
        uploaded_by: me.user_id,
      });
      uploaded++;
    } catch {
      /* skip a failed file, keep going */
    }
  }

  // Activity so the realtor sees the seller added their home.
  try {
    await service.from('activities').insert({
      firm_id: deal.firm_id,
      search_id: deal.id,
      actor_id: me.user_id,
      action: 'listing_added',
      target: address,
      metadata: { by: 'seller', docs: uploaded },
    });
  } catch {
    /* non-fatal */
  }

  revalidatePath('/client');
  revalidatePath('/client/houses');
  revalidatePath('/dashboard/deals/' + deal.id);
  return { ok: true as const, houseId: house?.id, docsAttached: uploaded };
}
