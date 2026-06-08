'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Signing links panel for a deal.
 *
 * Product decision: we do NOT integrate the DocuSign API. The realtor creates
 * the envelope in DocuSign (or any e-sign tool) and pastes the signing link
 * here, optionally tying it to a specific uploaded document. Every party on the
 * deal can then open the link (esign_envelopes participant-read policy).
 *
 * - canManage (firm staff): see the paste form + the list.
 * - everyone else (client, attorney, co-realtor): read-only list of links.
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
  canManage?: boolean;
};

const STATUS_STYLE: Record<string, string> = {
  created: 'bg-ink-100 text-ink-700',
  sent: 'bg-amber-100 text-amber-800',
  delivered: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  declined: 'bg-rose-100 text-rose-800',
  voided: 'bg-ink-200 text-ink-600',
};

const STATUS_LABEL: Record<string, string> = {
  sent: 'Awaiting signature',
  delivered: 'Awaiting signature',
  completed: 'Signed',
  declined: 'Declined',
  voided: 'Voided',
  created: 'Draft',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] || 'bg-ink-100 text-ink-700';
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ' +
        cls
      }
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function EsignPanel({
  searchId,
  documents,
  envelopes,
  canManage = true,
}: EsignPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [docId, setDocId] = useState('');
  const [busy, setBusy] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const docNameById = (id: string | null) =>
    id ? documents.find((d) => d.id === id)?.name || null : null;

  const save = async () => {
    setError(null);
    setNotice(null);
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      setError('Paste a full https:// signing link.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/docusign/manual-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          searchId,
          envelopeUrl: u,
          documentId: docId || undefined,
          label: label.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Could not save link (${res.status})`);
      }
      setNotice('Signing link attached. Everyone on the deal can open it.');
      setUrl('');
      setLabel('');
      setDocId('');
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || 'Could not save the link.');
    } finally {
      setBusy(false);
    }
  };

  const markSigned = async (envelopeId: string) => {
    setError(null);
    setNotice(null);
    setMarkingId(envelopeId);
    try {
      const res = await fetch('/api/docusign/manual-link/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ envelopeId, status: 'completed' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Could not update (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err: any) {
      setError(err?.message || 'Could not update status.');
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft">
      <div className="flex items-baseline justify-between border-b border-ink-200 px-5 py-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Signing links
        </h2>
        <span className="text-xs text-ink-500">
          {envelopes.length === 0
            ? 'No links yet'
            : envelopes.length + ' link' + (envelopes.length === 1 ? '' : 's')}
        </span>
      </div>

      <div className="space-y-4 px-5 py-4">
        {canManage && (
          <div className="space-y-2 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
            <p className="text-xs text-ink-600">
              Create the envelope in DocuSign (or any e-sign tool), then paste
              the signing link here. Everyone on the deal will be able to open
              it.
            </p>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://app.docusign.com/signing/…"
              disabled={busy}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex-1">
                <span className="mb-1 block text-[11px] font-semibold text-ink-600">
                  Which document does this apply to?
                </span>
                <select
                  value={docId}
                  onChange={(e) => setDocId(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none"
                >
                  <option value="">— Not tied to a document —</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-[11px] font-semibold text-ink-600">
                  Label (optional)
                </span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Purchase agreement"
                  disabled={busy}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ink-400 focus:outline-none"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={busy || !url.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Attach signing link'}
              </button>
            </div>
          </div>
        )}

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

        {envelopes.length === 0 ? (
          !canManage && (
            <p className="text-sm text-ink-500">
              No documents have been sent for signature yet.
            </p>
          )
        ) : (
          <ul className="divide-y divide-ink-100 border-t border-ink-100 pt-1">
            {envelopes.map((env) => {
              const recips = Array.isArray(env.recipients)
                ? env.recipients
                : env.recipients?.signers
                  ? env.recipients.signers
                  : [];
              const labelText =
                recips.find((r: any) => r?.label)?.label ||
                docNameById(env.document_id) ||
                'Signing link';
              const doc = docNameById(env.document_id);
              return (
                <li
                  key={env.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={env.status} />
                      <span className="truncate text-sm font-medium text-ink-900">
                        {labelText}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      Added {new Date(env.created_at).toLocaleDateString()}
                      {doc && <> · Document: {doc}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManage &&
                      env.status !== 'completed' &&
                      env.status !== 'voided' && (
                        <button
                          type="button"
                          onClick={() => markSigned(env.envelope_id)}
                          disabled={markingId === env.envelope_id || pending}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
                        >
                          {markingId === env.envelope_id
                            ? 'Saving…'
                            : 'Mark signed'}
                        </button>
                      )}
                    {env.envelope_url && (
                      <a
                        href={env.envelope_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-amber-950 transition hover:bg-amber-300"
                      >
                        Open to sign ↗
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
