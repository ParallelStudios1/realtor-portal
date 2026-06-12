'use client';

import { useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  confirmExtractionAction,
  discardExtractionAction,
} from './extractionActions';

/**
 * Feature 4B — review surface for a STAGED contract extraction.
 *
 * Renders the AI's proposed dates as an editable table (label + date picker),
 * each pre-checked, alongside read-only party and contingency read-outs. A
 * prominent banner reminds the agent these are suggestions to verify against
 * the contract.
 *
 * Nothing is written to the deal until the agent presses "Confirm & add to
 * deal" — and only the checked, possibly-edited rows are sent to
 * confirmExtractionAction. This is the mandatory human-confirm gate.
 */

export type ProposedDate = {
  label: string;
  date: string; // ISO yyyy-mm-dd (may be empty if model omitted)
  confidence: number;
  source_snippet: string;
};
export type ProposedParty = { role: string; name: string; email: string };
export type Contingency = { type: string; deadline: string; notes: string };

export type StagedExtraction = {
  id: string;
  status: string;
  proposed_dates: ProposedDate[] | null;
  proposed_parties: ProposedParty[] | null;
  contingencies: Contingency[] | null;
  raw?: any;
};

type Row = {
  checked: boolean;
  label: string;
  date: string;
  confidence: number;
  source_snippet: string;
};

export function ExtractReview({
  extraction,
  documentName,
  onClose,
}: {
  extraction: StagedExtraction;
  documentName?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const initialRows: Row[] = useMemo(
    () =>
      (extraction.proposed_dates || []).map((d) => ({
        checked: true,
        label: d.label || '',
        date: d.date || '',
        confidence: typeof d.confidence === 'number' ? d.confidence : 0,
        source_snippet: d.source_snippet || '',
      })),
    [extraction.proposed_dates]
  );

  const [rows, setRows] = useState<Row[]>(initialRows);

  const parties = extraction.proposed_parties || [];
  const contingencies = extraction.contingencies || [];

  const isFallback =
    rows.length === 0 &&
    typeof extraction?.raw?.note === 'string' &&
    extraction.raw.note.includes('manual entry');

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function patchRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addBlankRow() {
    setRows((prev) => [
      ...prev,
      { checked: true, label: '', date: '', confidence: 0, source_snippet: '' },
    ]);
  }

  const checkedValid = rows.filter(
    (r) => r.checked && r.label.trim() && ISO_DATE.test(r.date.trim())
  );

  function confirm() {
    if (checkedValid.length === 0) {
      toast.show('Tick at least one date with a label and a valid date.', {
        variant: 'error',
      });
      return;
    }
    start(async () => {
      const r = await confirmExtractionAction({
        extractionId: extraction.id,
        selectedDates: checkedValid.map((row) => ({
          label: row.label.trim(),
          date: row.date.trim(),
        })),
      });
      if (!r.ok) {
        toast.show(r.error || 'Could not add dates.', { variant: 'error' });
        return;
      }
      toast.show(
        `Added ${r.inserted} date${r.inserted === 1 ? '' : 's'} to the deal.`,
        { variant: 'success' }
      );
      onClose();
      router.refresh();
    });
  }

  function discard() {
    if (!confirmWindow('Discard these suggestions? No dates will be saved.')) return;
    start(async () => {
      const r = await discardExtractionAction({ extractionId: extraction.id });
      if (!r.ok) {
        toast.show(r.error || 'Could not discard.', { variant: 'error' });
        return;
      }
      toast.show('Suggestions discarded.', { variant: 'success' });
      onClose();
      router.refresh();
    });
  }

  // Portal to <body> so transformed ancestors can't trap the fixed overlay.
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-soft-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight text-ink-900">
              Review contract dates
            </h3>
            {documentName && (
              <p className="truncate text-xs text-ink-500">{documentName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="-mr-1.5 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scroll body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Review banner */}
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-amber-950"
            >
              !
            </span>
            <p className="text-amber-900">
              <strong>Review these against the contract before saving.</strong>{' '}
              Nothing is added to the deal until you confirm. Untick anything wrong,
              fix labels and dates, then save only what you trust.
            </p>
          </div>

          {isFallback && (
            <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700">
              Automatic extraction isn&rsquo;t available right now. Add the
              contract dates by hand below.
            </div>
          )}

          {/* Proposed dates table */}
          <section className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Proposed dates
              </h4>
              <button
                type="button"
                onClick={addBlankRow}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + Add a date
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
                No dates proposed. Use &ldquo;Add a date&rdquo; to enter one
                manually.
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((r, i) => {
                  const dateValid = ISO_DATE.test(r.date.trim());
                  return (
                    <li
                      key={i}
                      className={
                        'rounded-xl border px-3 py-3 transition ' +
                        (r.checked
                          ? 'border-ink-200 bg-white'
                          : 'border-ink-100 bg-ink-50/60 opacity-70')
                      }
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={r.checked}
                          onChange={(e) => patchRow(i, { checked: e.target.checked })}
                          className="mt-2 h-4 w-4 shrink-0 rounded border-ink-300"
                          aria-label="Include this date"
                        />
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-500">
                              Label
                            </span>
                            <input
                              className={inputCls}
                              value={r.label}
                              placeholder="e.g. Closing date"
                              onChange={(e) => patchRow(i, { label: e.target.value })}
                            />
                          </label>
                          <label className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-500">
                              Date
                            </span>
                            <input
                              type="date"
                              className={
                                inputCls +
                                (r.checked && r.date && !dateValid
                                  ? ' border-rose-400'
                                  : '')
                              }
                              value={r.date}
                              onChange={(e) => patchRow(i, { date: e.target.value })}
                            />
                          </label>
                        </div>
                      </div>

                      {(r.confidence > 0 || r.source_snippet) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-7 text-[11px] text-ink-500">
                          {r.confidence > 0 && (
                            <span
                              className={
                                'rounded-full px-2 py-0.5 font-semibold ' +
                                confidenceTone(r.confidence)
                              }
                              title="Extraction confidence"
                            >
                              {Math.round(r.confidence * 100)}% confident
                            </span>
                          )}
                          {r.source_snippet && (
                            <span className="min-w-0 flex-1 truncate italic">
                              &ldquo;{r.source_snippet}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Parties read-out */}
          {parties.length > 0 && (
            <section className="mb-5">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Parties detected
              </h4>
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {parties.map((p, i) => (
                  <li key={i} className="flex items-baseline gap-2 px-3 py-2 text-sm">
                    <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                      {p.role || 'party'}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink-900">
                      {p.name || '—'}
                    </span>
                    {p.email && (
                      <span className="truncate text-xs text-blue-600">{p.email}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Contingencies read-out */}
          {contingencies.length > 0 && (
            <section className="mb-2">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                Contingencies
              </h4>
              <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200">
                {contingencies.map((c, i) => (
                  <li key={i} className="px-3 py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-ink-900">
                        {c.type || 'Contingency'}
                      </span>
                      {c.deadline && (
                        <span className="text-xs font-semibold text-ink-700">
                          {c.deadline}
                        </span>
                      )}
                    </div>
                    {c.notes && (
                      <p className="mt-0.5 text-[11px] text-ink-500">{c.notes}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 border-t border-ink-100 p-5">
          <button
            type="button"
            disabled={pending}
            onClick={discard}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
          >
            Discard
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || checkedValid.length === 0}
              onClick={confirm}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-soft-sm transition hover:bg-ink-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                `Confirm & add to deal${
                  checkedValid.length ? ` (${checkedValid.length})` : ''
                }`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function confirmWindow(msg: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(msg);
}

function confidenceTone(c: number): string {
  if (c >= 0.8) return 'bg-emerald-100 text-emerald-800';
  if (c >= 0.5) return 'bg-amber-100 text-amber-800';
  return 'bg-rose-100 text-rose-800';
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

const inputCls =
  'mt-1 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm shadow-soft-xs transition placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10';
