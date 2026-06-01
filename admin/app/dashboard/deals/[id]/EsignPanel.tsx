'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * E-sign panel for a deal. Drives the DocuSign envelope lifecycle from the
 * deal workspace:
 *   - Pick a document already uploaded to the deal, then "Send for signature".
 *     We resolve a short-lived signed URL for the document, hand it to
 *     /api/docusign/create, which fans out the envelope to all deal parties.
 *   - Show every tracked envelope (esign_envelopes rows) with its status, a
 *     link into DocuSign, and a "Refresh status" poll fallback.
 *   - When DocuSign isn't configured (the create route soft-skips with 503
 *     skipped:true), reveal a manual paste-URL fallback that records the
 *     envelope link on the deal.
 *
 * Self-contained: talks only to /api/docusign/* + /api/documents/sign-url.
 * Server data arrives via props; we router.refresh() after mutations so the
 * server-rendered rows update.
 */

export type EsignDocument = {
  id: string;
  name: string;
  storage_path: string;
};

export type EsignEnvelopeRow = {
  id: string;
  envelope_id: string;
  envelope_url: string | null;
  status: string;
  recipients: any;
  completed_at: string | null;
  created_at: string;
  document_id: string | null;
};

export type EsignPanelProps = {
  searchId: string;
  documents: EsignDocument[];
  envelopes: EsignEnvelopeRow[];
};

const STATUS_STYLE: Record<string, string> = {
  created: 'bg-ink-100 text-ink-700',
  sent: 'bg-amber-100 text-amber-800',
  delivered: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
  voided: 'bg-ink-200 text-ink-600',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] || 'bg-ink-100 text-ink-700';
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ' +
        cls
      }
    >
      {status}
    </span>
  );
}

export function EsignPanel({ searchId, documents, envelopes }: EsignPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selectedDocId, setSelectedDocId] = useState<string>(
    documents[0]?.id || ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Manual fallback (revealed when the create route reports DocuSign is unset).
  const [showManual, setShowManual] = useState(false);
  const [manualUrl, setManualUrl] = useState('');

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setNotice(null);
    const doc = documents.find((d) => d.id === selectedDocId);
    if (!doc) {
      setError('Choose a document to send.');
      return;
    }
    setBusy(true);
    try {
      // 1) Resolve a signed URL DocuSign's server can fetch.
      const sres = await fetch('/api/documents/sign-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storage_path: doc.storage_path }),
      });
      const sjson = await sres.json().catch(() => ({}));
      if (!sres.ok || !sjson?.url) {
        throw new Error(sjson?.error || `Could not sign document URL (${sres.status})`);
      }

      // 2) Kick off the envelope.
      const cres = await fetch('/api/docusign/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId,
          documentId: doc.id,
          documentUrl: sjson.url,
          documentName: doc.name,
        }),
      });
      const cjson = await cres.json().catch(() => ({}));
      if (cres.status === 503 && cjson?.skipped) {
        // DocuSign isn't configured — fall back to manual paste.
        setShowManual(true);
        setError(cjson.error || 'DocuSign is not configured. Paste the URL manually.');
        return;
      }
      if (!cres.ok || !cjson?.ok) {
        throw new Error(cjson?.error || `Send failed (${cres.status})`);
      }
      setNotice('Sent for signature. Parties have been notified.');
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || 'Could not send for signature.');
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch('/api/docusign/manual-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ searchId, envelopeUrl: manualUrl }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Could not save link (${res.status})`);
      }
      setNotice('Envelope link saved to the deal.');
      setManualUrl('');
      setShowManual(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || 'Could not save the link.');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async (envelopeId: string) => {
    setError(null);
    setNotice(null);
    setRefreshingId(envelopeId);
    try {
      const res = await fetch('/api/docusign/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ envelopeId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 503 && json?.skipped) {
        setError(json.error || 'DocuSign polling is not available on this deployment.');
        return;
      }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Refresh failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || 'Could not refresh status.');
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-ink-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-ink-200 px-5 py-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          E-signature
        </h2>
        <span className="text-xs text-ink-500">
          {envelopes.length === 0
            ? 'No envelopes yet'
            : envelopes.length + ' envelope' + (envelopes.length === 1 ? '' : 's')}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Send for signature */}
        <div className="space-y-2">
          {documents.length === 0 ? (
            <p className="text-sm text-ink-500">
              Upload a document to this deal first, then send it for signature.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="mb-1 block text-xs font-semibold text-ink-600">
                  Document to sign
                </span>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none"
                >
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={send}
                disabled={busy || !selectedDocId}
                aria-busy={busy}
                className="inline-flex items-center justify-center rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send for signature'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </p>
        )}

        {/* Manual paste-URL fallback (when DocuSign is unconfigured). */}
        {showManual && (
          <div className="space-y-2 rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="text-xs text-ink-600">
              DocuSign isn&apos;t connected on this deployment. Create the
              envelope in DocuSign yourself, then paste its URL here to attach
              it to the deal.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://app.docusign.com/documents/details/…"
                disabled={busy}
                className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={saveManual}
                disabled={busy || !manualUrl.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save link'}
              </button>
            </div>
          </div>
        )}

        {/* Tracked envelopes */}
        {envelopes.length > 0 && (
          <ul className="divide-y divide-ink-100 border-t border-ink-100 pt-1">
            {envelopes.map((env) => {
              const recips = Array.isArray(env.recipients)
                ? env.recipients
                : env.recipients?.signers
                  ? env.recipients.signers
                  : [];
              return (
                <li
                  key={env.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={env.status} />
                      <span className="truncate text-sm font-medium text-ink-900">
                        Envelope {env.envelope_id.slice(0, 8)}…
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      Sent {new Date(env.created_at).toLocaleDateString()}
                      {env.completed_at && (
                        <>
                          {' · '}
                          Completed{' '}
                          {new Date(env.completed_at).toLocaleDateString()}
                        </>
                      )}
                      {recips.length > 0 && (
                        <>
                          {' · '}
                          {recips.length} recipient
                          {recips.length === 1 ? '' : 's'}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {env.status !== 'completed' &&
                      env.status !== 'declined' &&
                      env.status !== 'voided' && (
                        <button
                          type="button"
                          onClick={() => refresh(env.envelope_id)}
                          disabled={refreshingId === env.envelope_id || pending}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
                        >
                          {refreshingId === env.envelope_id
                            ? 'Refreshing…'
                            : 'Refresh status'}
                        </button>
                      )}
                    {env.envelope_url && (
                      <a
                        href={env.envelope_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
                      >
                        Open DocuSign ↗
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
