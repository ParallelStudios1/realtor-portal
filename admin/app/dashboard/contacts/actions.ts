'use server';

import { revalidatePath } from 'next/cache';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export type ContactRoleOption =
  | 'realtor'
  | 'attorney'
  | 'lender'
  | 'inspector'
  | 'photographer'
  | 'contractor'
  | 'assistant'
  | 'other';

function cleanString(s: FormDataEntryValue | null): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

/**
 * Save a standalone contact to the firm's address book. Not tied to any
 * deal — this is just "I want this person in my contacts".
 *
 * Form fields: name, email, phone, role, company, notes.
 * The (firm_id, lower(email)) unique index will reject duplicates.
 */
export async function addFirmContactAction(form: FormData): Promise<
  | { ok: true; id: string }
  | { ok: false; error: string }
> {
  const me = await getMe();
  if (!me || !me.firm_id) return { ok: false, error: 'Not signed in.' };

  const name = cleanString(form.get('name'));
  const email = cleanString(form.get('email'));
  const phone = cleanString(form.get('phone'));
  const role = cleanString(form.get('role'));
  const company = cleanString(form.get('company'));
  const notes = cleanString(form.get('notes'));

  if (!name && !email && !phone) {
    return { ok: false, error: 'At least a name, email, or phone is required.' };
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('firm_contacts')
    .insert({
      firm_id: me.firm_id,
      created_by: me.user_id,
      name,
      email: email ? email.toLowerCase() : null,
      phone,
      role,
      company,
      notes,
    })
    .select('id')
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return { ok: false, error: 'A contact with that email already exists.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/dashboard/contacts');
  return { ok: true, id: (data as any).id };
}

/**
 * Update an existing firm_contact. Same field shape as add.
 */
export async function updateFirmContactAction(
  id: string,
  form: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMe();
  if (!me || !me.firm_id) return { ok: false, error: 'Not signed in.' };

  const name = cleanString(form.get('name'));
  const email = cleanString(form.get('email'));
  const phone = cleanString(form.get('phone'));
  const role = cleanString(form.get('role'));
  const company = cleanString(form.get('company'));
  const notes = cleanString(form.get('notes'));

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('firm_contacts')
    .update({
      name,
      email: email ? email.toLowerCase() : null,
      phone,
      role,
      company,
      notes,
    })
    .eq('id', id)
    .eq('firm_id', me.firm_id);

  if (error) {
    if ((error as any).code === '23505') {
      return { ok: false, error: 'A contact with that email already exists.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/dashboard/contacts');
  return { ok: true };
}

/**
 * Delete a firm_contact. Hard delete — no soft-delete on the address book.
 */
export async function deleteFirmContactAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getMe();
  if (!me || !me.firm_id) return { ok: false, error: 'Not signed in.' };

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from('firm_contacts')
    .delete()
    .eq('id', id)
    .eq('firm_id', me.firm_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/contacts');
  return { ok: true };
}
