'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';

export function UploadDocumentClient({
  firmId,
  searchId,
  clientId,
}: {
  firmId: string;
  searchId: string;
  clientId: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.show('Pick a file first.', { variant: 'error' });
    if (!title.trim())
      return toast.show('Add a title for the document.', { variant: 'error' });
    setPending(true);
    try {
      const path = `${firmId}/${searchId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('client-docs')
        .upload(path, file, { upsert: false });
      if (upErr) {
        toast.show('Upload failed: ' + upErr.message, { variant: 'error' });
        setPending(false);
        return;
      }
      const { error: insertErr } = await supabase.from('documents').insert({
        firm_id: firmId,
        search_id: searchId,
        name: title.trim(),
        storage_path: path,
        mime_type: file.type || null,
        file_size: file.size || null,
      });
      if (insertErr) {
        toast.show('Saved file but DB row failed: ' + insertErr.message, {
          variant: 'error',
        });
        setPending(false);
        return;
      }
      toast.show('Document uploaded.', { variant: 'success' });
      router.push(`/dashboard/clients/${clientId}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-sm">
        <span className="block text-xs font-medium text-slate-600">Title</span>
        <input
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Purchase contract, disclosure, etc."
        />
      </label>
      <label className="block text-sm">
        <span className="block text-xs font-medium text-slate-600">File</span>
        <input
          ref={fileRef}
          type="file"
          className="mt-1 block w-full text-sm"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={upload}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Uploading…' : 'Upload document'}
      </button>
    </div>
  );
}
