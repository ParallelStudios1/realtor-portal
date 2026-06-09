'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

type SellerDeal = {
  id: string;
  firm_id: string;
  kind: string;
  client_id: string;
};

/**
 * Resolve the caller's most recent SELLER deal where they're the principal
 * client. Shared by the prepare + create steps below.
 */
async function resolveSellerDeal(): Promise<
  { ok: true; deal: SellerDeal; userId: string } | { ok: false; error: string }
> {
  const me = await getMe();
  if (!me?.user_id) return { ok: false, error: 'Not signed in.' };

  const service = getSupabaseServiceRoleClient();
  const { data: deals } = await service
    .from('client_searches')
    .select('id, firm_id, kind, client_id')
    .eq('client_id', me.user_id)
    .eq('kind', 'seller')
    .order('created_at', { ascending: false })
    .limit(1);
  const deal = (deals || [])[0] as SellerDeal | undefined;
  if (!deal) {
    return { ok: false, error: 'No listing deal found for your account.' };
  }
  return { ok: true, deal, userId: me.user_id };
}

export type ListingUploadTarget = {
  name: string;
  path: string;
  token: string;
  size: number;
  type: string;
};

/**
 * STEP 1 (only when the seller attaches documents): mint signed upload URLs
 * for each file. The browser then uploads the bytes DIRECTLY to Supabase
 * Storage with these tokens — which (a) bypasses RLS, since signed upload URLs
 * are pre-authorized, and (b) avoids routing big files through the Next.js
 * Server Action, whose body is capped at ~1 MB (and Vercel's function body at
 * ~4.5 MB). Without this, attaching a real PDF/photo blew past the limit and
 * the action resolved `undefined`, crashing the page.
 */
export async function prepareSellerListingUploads(
  files: { name: string; size: number; type: string }[]
): Promise<
  | { ok: true; targets: ListingUploadTarget[] }
  | { ok: false; error: string }
> {
  const resolved = await resolveSellerDeal();
  if (!resolved.ok) return resolved;
  const { deal } = resolved;
  const service = getSupabaseServiceRoleClient();

  const targets: ListingUploadTarget[] = [];
  for (const f of files) {
    const safeName = (f.name || 'file').replace(/[^\w.\-]+/g, '_');
    const path = `${deal.firm_id}/${deal.id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${encodeURIComponent(safeName)}`;
    const { data, error } = await service.storage
      .from('client-docs')
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { ok: false, error: error?.message || 'Could not prepare upload.' };
    }
    targets.push({
      name: f.name,
      path: data.path,
      token: data.token,
      size: f.size,
      type: f.type,
    });
  }
  return { ok: true, targets };
}

/**
 * STEP 2: create the listing. The house fields come through as a small form
 * body; any attached documents are passed as METADATA only (they were already
 * uploaded to storage in step 1), so this request is always tiny.
 *
 * Authorized strictly: caller must be the principal client of a SELLER deal.
 */
export async function addSellerListingAction(fd: FormData) {
  const resolved = await resolveSellerDeal();
  if (!resolved.ok) return { ok: false as const, error: resolved.error };
  const { deal, userId } = resolved;
  const service = getSupabaseServiceRoleClient();

  const address = (fd.get('address') as string)?.trim();
  if (!address) return { ok: false as const, error: 'Enter the address.' };
  const listPrice = (fd.get('list_price') as string)?.trim();
  const photoUrl = (fd.get('photo_url') as string)?.trim() || null;
  const beds = (fd.get('bedrooms') as string)?.trim();
  const baths = (fd.get('bathrooms') as string)?.trim();
  const sqft = (fd.get('square_feet') as string)?.trim();
  const notes = (fd.get('notes') as string)?.trim() || null;

  // Already-uploaded document metadata (from prepareSellerListingUploads).
  let docs: { name: string; path: string; size?: number; type?: string }[] = [];
  try {
    const raw = fd.get('docs_meta') as string | null;
    if (raw) docs = JSON.parse(raw);
  } catch {
    docs = [];
  }

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

  // Record document rows for the files uploaded in step 1.
  let attached = 0;
  for (const d of docs) {
    if (!d?.path || !d?.name) continue;
    const { error: docErr } = await service.from('documents').insert({
      firm_id: deal.firm_id,
      search_id: deal.id,
      name: d.name,
      storage_path: d.path,
      mime_type: d.type || null,
      file_size: d.size || null,
      folder: 'Listing',
      uploaded_by: userId,
    });
    if (!docErr) attached++;
  }

  try {
    await service.from('activities').insert({
      firm_id: deal.firm_id,
      search_id: deal.id,
      actor_id: userId,
      action: 'listing_added',
      target: address,
      metadata: { by: 'seller', docs: attached },
    });
  } catch {
    /* non-fatal */
  }

  revalidatePath('/client');
  revalidatePath('/client/houses');
  revalidatePath('/dashboard/deals/' + deal.id);
  return { ok: true as const, houseId: house?.id, docsAttached: attached };
}
