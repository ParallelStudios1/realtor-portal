'use server';

/**
 * Feature 4B - server actions for the human-confirm gate of AI contract-date
 * extraction. Called from ExtractReview (client component).
 *
 * The AI route (/api/ai/contract-extract) only ever STAGES proposals into
 * contract_extractions. NOTHING reaches important_dates until a human reviews
 * the suggestions and calls confirmExtractionAction with the exact rows they
 * approved. This file is the only place where staged dates become real deal
 * dates.
 *
 * Conventions match deadlineActions.ts / clients/[id]/actions.ts:
 *   - Returns { ok: true, ... } on success, { ok: false, error } on failure.
 *   - getMe() for auth + role, service-role client for writes.
 *   - Writes an `activities` row, calls logAudit, then revalidatePath.
 */
import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { logAudit } from '@/lib/audit';

type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type AuthOk = {
  ok: true;
  me: NonNullable<Awaited<ReturnType<typeof getMe>>>;
  extraction: {
    id: string;
    firm_id: string;
    search_id: string;
    document_id: string | null;
    status: string;
  };
  service: ReturnType<typeof getSupabaseServiceRoleClient>;
};
type AuthErr = { ok: false; error: string };

/**
 * Authorize the caller against a contract_extractions row: returns it when the
 * caller is staff in the extraction's firm.
 */
async function authorizeExtraction(extractionId: string): Promise<AuthOk | AuthErr> {
  const me = await getMe();
  if (!me?.firm_id) return { ok: false, error: 'Not authenticated.' };
  if (!STAFF_ROLES.includes(me.role || '')) return { ok: false, error: 'Forbidden.' };

  const service = getSupabaseServiceRoleClient();
  const { data: extraction } = await service
    .from('contract_extractions')
    .select('id, firm_id, search_id, document_id, status')
    .eq('id', extractionId)
    .maybeSingle();
  if (!extraction) return { ok: false, error: 'Extraction not found.' };
  if ((extraction as any).firm_id !== me.firm_id && me.role !== 'super_admin') {
    return { ok: false, error: 'Forbidden.' };
  }
  return { ok: true, me, extraction: extraction as any, service };
}

/**
 * Confirm a staged extraction: inserts ONLY the human-approved dates into
 * important_dates, then marks the extraction confirmed.
 *
 * selectedDates is exactly the set of rows the agent checked (and possibly
 * edited) in the review UI - we never read proposed_dates off the row here, so
 * unchecked or edited-away suggestions are guaranteed not to be written.
 */
export async function confirmExtractionAction(input: {
  extractionId: string;
  selectedDates: { label: string; date: string }[];
}): Promise<ActionResult<{ inserted: number }>> {
  const auth = await authorizeExtraction(input.extractionId);
  if (!auth.ok) return auth;
  const { me, extraction, service } = auth;

  if (extraction.status === 'confirmed') {
    return { ok: false, error: 'This extraction has already been confirmed.' };
  }
  if (extraction.status === 'discarded') {
    return { ok: false, error: 'This extraction was discarded.' };
  }

  // Validate + normalise the human-approved rows. Drop anything malformed
  // rather than writing junk into the deal timeline.
  const clean = (input.selectedDates || [])
    .map((d) => ({
      label: String(d?.label ?? '').trim(),
      date: String(d?.date ?? '').trim(),
    }))
    .filter((d) => d.label && ISO_DATE.test(d.date));

  if (clean.length === 0) {
    return { ok: false, error: 'Select at least one valid date to add.' };
  }

  const rows = clean.map((d) => ({
    firm_id: extraction.firm_id,
    search_id: extraction.search_id,
    label: d.label,
    date: d.date,
    notes: 'Added from AI contract extraction (human-confirmed)',
    created_by: me.user_id,
  }));

  const { error: insErr } = await service.from('important_dates').insert(rows);
  if (insErr) {
    return { ok: false, error: insErr.message || 'Could not save dates.' };
  }

  const { error: updErr } = await service
    .from('contract_extractions')
    .update({
      status: 'confirmed',
      confirmed_by: me.user_id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', extraction.id);
  if (updErr) {
    // Dates were written; surface the status-update failure but don't pretend
    // it fully failed.
    return {
      ok: false,
      error: 'Dates were added but the extraction status could not be updated: ' + updErr.message,
    };
  }

  await service.from('activities').insert({
    firm_id: extraction.firm_id,
    search_id: extraction.search_id,
    actor_id: me.user_id,
    action: 'extraction_confirmed',
    target: `${clean.length} contract date${clean.length === 1 ? '' : 's'}`,
    metadata: {
      extraction_id: extraction.id,
      document_id: extraction.document_id,
      count: clean.length,
    },
  });
  await logAudit({
    firmId: extraction.firm_id,
    searchId: extraction.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'extraction.confirmed',
    entityType: 'contract_extraction',
    entityId: extraction.id,
    summary: `Confirmed ${clean.length} AI-extracted contract date(s)`,
    metadata: { document_id: extraction.document_id, count: clean.length },
  });

  revalidatePath(`/dashboard/deals/${extraction.search_id}`);
  return { ok: true, inserted: clean.length };
}

/** Discard a staged extraction without writing any dates. */
export async function discardExtractionAction(input: {
  extractionId: string;
}): Promise<ActionResult> {
  const auth = await authorizeExtraction(input.extractionId);
  if (!auth.ok) return auth;
  const { me, extraction, service } = auth;

  if (extraction.status === 'confirmed') {
    return { ok: false, error: 'This extraction was already confirmed and cannot be discarded.' };
  }

  const { error } = await service
    .from('contract_extractions')
    .update({ status: 'discarded' })
    .eq('id', extraction.id);
  if (error) return { ok: false, error: error.message };

  await service.from('activities').insert({
    firm_id: extraction.firm_id,
    search_id: extraction.search_id,
    actor_id: me.user_id,
    action: 'extraction_discarded',
    target: 'AI contract suggestions',
    metadata: { extraction_id: extraction.id, document_id: extraction.document_id },
  });
  await logAudit({
    firmId: extraction.firm_id,
    searchId: extraction.search_id,
    actor: { userId: me.user_id, email: me.email, role: me.role },
    action: 'extraction.discarded',
    entityType: 'contract_extraction',
    entityId: extraction.id,
    summary: 'Discarded AI-extracted contract suggestions',
    metadata: { document_id: extraction.document_id },
  });

  revalidatePath(`/dashboard/deals/${extraction.search_id}`);
  return { ok: true };
}
