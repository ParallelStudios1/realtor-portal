'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';

type Visibility = 'everyone' | 'firm' | 'restricted';

export type UploadParty = {
  key: string;
  label: string;
  userId: string | null;
  email: string | null;
};

/**
 * Attorney-facing document upload for the shared deal view.
 *
 * Backend rights come from migration 0059: an attorney on a deal may INSERT
 * into public.documents (as long as uploaded_by = auth.uid()) and write the
 * object under {firm_id}/{search_id}/... in the client-docs bucket. They can
 * also set visibility + a restricted recipient allow-list, same as realtors.
 *
 * Parties are passed in from the server component (service-role read) because
 * the attorney's own RLS doesn't grant reads on deal_participants/users.
 */
export function AttorneyUpload({
  firmId,
  searchId,
  uploaderId,
  parties,
}: {
  firmId: string;
  searchId: string;
  uploaderId: string;
  parties: UploadParty[];
}) {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  async function upload() {
    if (!file) {
      toast.show('Pick a file first.', { variant: 'error' });
      return;
    }
    if (visibility === 'restricted' && !parties.some((p) => chosen[p.key])) {
      toast.show('Pick at least one person to share with.', { variant: 'error' });
      return;
    }
    setPending(true);
    try {
      const path = `${firmId}/${searchId}/${Date.now()}-${encodeURIComponent(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from('client-docs')
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from('documents')
        .insert({
          firm_id: firmId,
          search_id: searchId,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          file_size: file.size || null,
          folder: 'General',
          visibility,
          // Required by the attorney RLS write policy.
          uploaded_by: uploaderId,
        })
        .select('id')
        .single();
      if (insErr || !inserted) throw insErr || new Error('insert failed');

      if (visibility === 'restricted') {
        const rows = parties
          .filter((p) => chosen[p.key])
          .map((p) => ({
            document_id: inserted.id,
            user_id: p.userId,
            recipient_email: p.userId ? null : p.email,
          }));
        if (rows.length > 0) {
          await supabase.from('document_recipients').insert(rows);
        }
      }

      toast.show('Document uploaded.', { variant: 'success' });
      setFile(null);
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      toast.show(e?.message || 'Upload failed.', { variant: 'error' });
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 inline-flex items-center gap-2 rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-semibold text-ink-800 shadow-sm transition hover:border-ink-400"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Add a document
      </button>
    );
  }

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-ink-200 bg-white p-4">
      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full text-sm"
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.heic"
      />

      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-500">
          Who can see this?
        </span>
        <div className="grid gap-1.5">
          {[
            { v: 'everyone' as Visibility, t: 'Everyone on the deal' },
            { v: 'firm' as Visibility, t: 'Realtor team only' },
            { v: 'restricted' as Visibility, t: 'Specific people' },
          ].map((opt) => (
            <label
              key={opt.v}
              className={
                'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ' +
                (visibility === opt.v ? 'border-ink-900 bg-ink-50' : 'border-ink-200')
              }
            >
              <input
                type="radio"
                name="attorney-doc-vis"
                checked={visibility === opt.v}
                onChange={() => setVisibility(opt.v)}
              />
              {opt.t}
            </label>
          ))}
        </div>
        {visibility === 'restricted' && (
          <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50/40 p-3">
            {parties.length === 0 ? (
              <p className="text-xs text-ink-500">No other parties on this deal.</p>
            ) : (
              <ul className="space-y-1.5">
                {parties.map((p) => (
                  <li key={p.key}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={!!chosen[p.key]}
                        onChange={(e) =>
                          setChosen((prev) => ({ ...prev, [p.key]: e.target.checked }))
                        }
                      />
                      {p.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !file}
          onClick={upload}
          className="inline-flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-sm text-ink-500 hover:text-ink-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
