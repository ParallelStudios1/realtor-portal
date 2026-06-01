'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/Toast';

const FOLDERS = [
  'Contracts',
  'Disclosures',
  'Inspection',
  'Appraisal',
  'Lender',
  'Title',
  'Closing',
  'General',
] as const;

/**
 * Drag-and-drop multi-file uploader. Files are pushed to the client-docs
 * bucket in parallel and a documents row is inserted for each. Each can be
 * tagged with a folder so the deal view groups them sensibly.
 */
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
  const [folder, setFolder] = useState<(typeof FOLDERS)[number]>('Contracts');
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    setFiles((prev) => [...prev, ...arr]);
  }

  async function uploadAll() {
    if (files.length === 0) {
      toast.show('Pick at least one file.', { variant: 'error' });
      return;
    }
    setPending(true);
    let ok = 0;
    let failed = 0;
    for (const file of files) {
      const path = `${firmId}/${searchId}/${Date.now()}-${encodeURIComponent(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from('client-docs')
        .upload(path, file, { upsert: false });
      if (upErr) {
        failed++;
        continue;
      }
      const { error: insertErr } = await supabase.from('documents').insert({
        firm_id: firmId,
        search_id: searchId,
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        file_size: file.size || null,
        folder,
      });
      if (insertErr) failed++;
      else ok++;
    }
    setPending(false);
    if (ok > 0) {
      toast.show(
        ok + ' file' + (ok === 1 ? '' : 's') + ' uploaded' +
          (failed > 0 ? ', ' + failed + ' failed' : '') +
          '.',
        { variant: failed === 0 ? 'success' : 'error' }
      );
    } else {
      toast.show('Upload failed.', { variant: 'error' });
    }
    if (ok > 0) {
      // Best-effort notify all parties.
      fetch('/api/documents/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId,
          folder,
          names: files.slice(0, ok).map((f) => f.name),
        }),
      }).catch(() => {});
      router.push(`/dashboard/clients/${clientId}`);
      router.refresh();
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-ink-200 bg-white p-5">
      <label className="block text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500">
          Folder
        </span>
        <select
          className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
          value={folder}
          onChange={(e) => setFolder(e.target.value as any)}
        >
          {FOLDERS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={
          'flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ' +
          (dragOver
            ? 'border-ink-900 bg-ink-50'
            : 'border-ink-300 bg-ink-50/40 hover:border-ink-400 hover:bg-ink-50')
        }
        onClick={() => fileRef.current?.click()}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-400">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
        </svg>
        <p className="mt-2 text-sm font-semibold text-ink-700">
          Drag and drop files here
        </p>
        <p className="text-xs text-ink-500">
          or click to pick — PDF, DOC, images, anything
        </p>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.heic"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-ink-200 bg-ink-50/40 p-3">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden>
                  <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" strokeLinejoin="round" />
                  <path d="M14 3v5h5" strokeLinejoin="round" />
                </svg>
                <span className="truncate">{f.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="inline-flex items-center justify-center text-ink-400 hover:text-rose-600"
                aria-label="Remove"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={pending || files.length === 0}
        onClick={uploadAll}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 12a10 10 0 1 1-10-10" strokeLinecap="round" />
          </svg>
        )}
        {pending
          ? 'Uploading…'
          : files.length === 0
          ? 'Pick or drop files first'
          : 'Upload ' + files.length + ' file' + (files.length === 1 ? '' : 's')}
      </button>
    </div>
  );
}
