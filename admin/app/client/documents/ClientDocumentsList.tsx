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
 * then opens it in a new tab. Cookie auth is automatic - same origin.
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
      <ul className="mt-6 divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
        {documents.map((d) => {
          const isOpening = openingId === d.id;
          return (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 px-4 py-3.5 transition hover:bg-ink-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-4.5 w-4.5"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{d.name}</div>
                  <div className="text-xs text-ink-500">
                    {new Date(d.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => open(d)}
                disabled={isOpening}
                className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
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
