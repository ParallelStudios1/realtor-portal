'use client';

import { useState } from 'react';

/**
 * DocuSign Quick-Send button. Opens DocuSign's "Quick Sign" page in a new
 * tab with the document URL prefilled, so the realtor can compose the
 * envelope in DocuSign UI, then come back here and paste the envelope URL.
 *
 * No JWT integration required. This is a UX shortcut on top of the existing
 * "paste envelope URL" flow — saves a couple of clicks.
 *
 * If the document URL points at a Supabase signed URL, DocuSign should be
 * able to fetch it. Otherwise the realtor falls back to uploading the
 * file inside DocuSign manually.
 */
export function DocusignSendButton({
  documentUrl,
  documentName,
}: {
  documentUrl: string | null;
  documentName?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!documentUrl) return null;

  const dsUrl =
    'https://app.docusign.com/sending/?source=external&fileUrl=' +
    encodeURIComponent(documentUrl) +
    (documentName ? '&fileName=' + encodeURIComponent(documentName) : '');

  async function copyDocUrl() {
    if (!documentUrl) return;
    try {
      await navigator.clipboard.writeText(documentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <a
        href={dsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17c4 1 9-5 13-1 2 2 5 0 5 0" />
          <path d="M3 21h18" />
        </svg>
        Send via DocuSign ↗
      </a>
      <button
        type="button"
        onClick={copyDocUrl}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        {copied ? '✓ Copied' : 'Copy file URL'}
      </button>
    </div>
  );
}
