'use client';

import { useState } from 'react';

type Doc = {
  id: string;
  name: string;
  storage_path: string;
  created_at: string;
};

/**
 * Tapping a row hits /api/documents/sign-url, gets a 5-minute signed URL,
 * then opens it in a new tab. Cookie auth is automatic — same origin.
 */
export function ClientDocumentsList({ documents }: { documents: Doc[] }) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (doc: Doc) => {
    setOpeningId(doc.id);
    setError(null);
    try {
      const res = await fetch('/api/documents/sign-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storage_path: doc.storage_path }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.url) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
      // Pop a new tab. We don't use window.location because we want the
      // documents list to stay put.
      window.open(json.url as string, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <ul className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {documents.map((d) => {
          const isOpening = openingId === d.id;
          return (
            <li key={d.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{d.name}</div>
                <div className="text-xs text-slate-500">
                  {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => open(d)}
                disabled={isOpening}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {isOpening ? 'Opening…' : 'Open'}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
