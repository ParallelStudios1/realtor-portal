'use client';

import { useState, useTransition } from 'react';
import {
  deleteDocumentAction,
  moveDocumentFolderAction,
} from './actions';
import { useToast } from '@/components/Toast';
import { DocusignSendButton } from '@/components/DocusignSendButton';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const FOLDERS = [
  'Contracts',
  'Disclosures',
  'Inspection',
  'Appraisal',
  'Lender',
  'Title',
  'Closing',
  'General',
];

export function DocumentRow({
  clientId,
  doc,
}: {
  clientId: string;
  doc: {
    id: string;
    name: string;
    storage_path: string;
    folder: string;
    created_at: string;
  };
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);

  async function loadSignedUrl() {
    if (docUrl) return docUrl;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.storage
      .from('client-docs')
      .createSignedUrl(doc.storage_path, 60 * 30);
    if (error || !data?.signedUrl) {
      toast.show('Could not generate file URL.', { variant: 'error' });
      return null;
    }
    setDocUrl(data.signedUrl);
    return data.signedUrl;
  }

  return (
    <li className="rounded-lg border border-ink-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="flex items-start gap-2 text-left"
            onClick={async () => {
              const url = await loadSignedUrl();
              if (url) window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden>
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" strokeLinejoin="round" />
              <path d="M14 3v5h5" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0">
              <div className="truncate font-medium text-ink-900 hover:underline">
                {doc.name}
              </div>
              <div className="text-xs text-ink-500">
                {new Date(doc.created_at).toLocaleDateString()}
              </div>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md px-2 py-1 text-xs font-semibold text-ink-500 hover:bg-ink-100"
            aria-label="Document options"
          >
            ⋯
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
          <label className="block text-xs">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-500">
              Folder
            </span>
            <select
              className="mt-1 w-full rounded-md border border-ink-300 px-2 py-1 text-xs"
              value={doc.folder || 'General'}
              disabled={pending}
              onChange={(e) =>
                start(async () => {
                  const r = await moveDocumentFolderAction(clientId, {
                    documentId: doc.id,
                    folder: e.target.value,
                  });
                  if (!r.ok)
                    toast.show(r.error || 'Failed', { variant: 'error' });
                  else toast.show('Moved.', { variant: 'success' });
                })
              }
            >
              {FOLDERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>

          <DocSendInline docUrl={docUrl} loadSignedUrl={loadSignedUrl} name={doc.name} />

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm('Delete "' + doc.name + '" permanently?')) return;
              start(async () => {
                const r = await deleteDocumentAction(clientId, doc.id);
                if (!r.ok)
                  toast.show(r.error || 'Failed', { variant: 'error' });
                else toast.show('Deleted.', { variant: 'success' });
              });
            }}
            className="text-xs font-semibold text-rose-600 hover:underline"
          >
            Delete document
          </button>
        </div>
      )}
    </li>
  );
}

function DocSendInline({
  docUrl,
  loadSignedUrl,
  name,
}: {
  docUrl: string | null;
  loadSignedUrl: () => Promise<string | null>;
  name: string;
}) {
  const [url, setUrl] = useState<string | null>(docUrl);
  return (
    <div>
      {url ? (
        <DocusignSendButton documentUrl={url} documentName={name} />
      ) : (
        <button
          type="button"
          onClick={async () => {
            const u = await loadSignedUrl();
            if (u) setUrl(u);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          Send via DocuSign ↗
        </button>
      )}
    </div>
  );
}
