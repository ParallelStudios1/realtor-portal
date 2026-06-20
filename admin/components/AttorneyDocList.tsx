'use client';

import { useState } from 'react';
import { LocalDateTime } from '@/components/LocalDateTime';

/**
 * Read-only document list for the attorney deal view. Tapping "View" hits
 * /api/documents/sign-url to get a 5-minute signed URL, then opens it in a new
 * tab. Cookie auth is automatic (same origin). The route authorizes the caller
 * server-side (deal_participants.can_view_documents), so if a legacy attorney
 * lacks a participant row the request 403s - we surface that inline rather than
 * silently failing. Purely presentational + a read-only signed-URL fetch; this
 * component NEVER mutates deal state.
 */

export type AttorneyDoc = {
  id: string;
  name: string;
  mime_type: string | null;
  created_at: string;
  storage_path: string | null;
};

function typeLabel(mime: string | null): string {
  if (!mime) return 'File';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase();
  if (mime.includes('word') || mime.includes('document')) return 'DOC';
  if (mime.includes('sheet') || mime.includes('excel')) return 'XLS';
  const slash = mime.split('/');
  return (slash[1] || slash[0] || 'File').slice(0, 6).toUpperCase();
}

export function AttorneyDocList({ documents }: { documents: AttorneyDoc[] }) {
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async (doc: AttorneyDoc) => {
    if (!doc.storage_path) return;
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
      window.open(json.url as string, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      <ul className="divide-y divide-ink-100">
        {documents.map((doc) => {
          const isOpening = openingId === doc.id;
          return (
            <li
              key={doc.id}
              className="flex items-center gap-3 py-2.5 text-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
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
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink-900">
                  {doc.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-ink-600">
                    {typeLabel(doc.mime_type)}
                  </span>
                  <span>
                    Added{' '}
                    <LocalDateTime
                      value={doc.created_at}
                      dateOptions={{
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }}
                      placeholder="-"
                    />
                  </span>
                </div>
              </div>
              {doc.storage_path && (
                <button
                  type="button"
                  onClick={() => open(doc)}
                  disabled={isOpening}
                  className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                >
                  {isOpening ? 'Opening…' : 'View'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
