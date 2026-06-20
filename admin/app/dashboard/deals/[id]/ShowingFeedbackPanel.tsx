'use client';

/**
 * Per-showing feedback control in the deal workspace.
 *   - "Request feedback" button stamps feedback_requested_at and emails
 *     attendees + the principal client a link to the public feedback form.
 *     Once requested, shows a "Requested" confirmation.
 *   - An expandable section lazy-loads existing feedback for the showing and
 *     lists each response (stars, interest, price opinion, liked, concerns,
 *     author).
 *
 * Flat ink palette, Inter (inherited), useTransition spinner. No gradients.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  requestShowingFeedbackAction,
  getShowingFeedbackAction,
} from './feedbackActions';

type FeedbackRow = {
  id: string;
  author_name: string | null;
  author_email: string | null;
  stars: number | null;
  interest: string | null;
  price_opinion: string | null;
  liked: string | null;
  concerns: string | null;
  share_with_seller?: boolean | null;
  created_at: string | null;
};

const INTEREST_LABELS: Record<string, string> = {
  not_interested: 'Not interested',
  maybe: 'Maybe',
  interested: 'Interested',
  offer_likely: 'Likely to offer',
};

const PRICE_LABELS: Record<string, string> = {
  overpriced: 'Felt overpriced',
  about_right: 'Price about right',
  underpriced: 'Felt underpriced',
};

function starString(n: number | null | undefined): string {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
}

export function ShowingFeedbackPanel({
  clientId,
  showingId,
  feedbackRequestedAt,
  address,
}: {
  clientId: string;
  showingId: string;
  feedbackRequestedAt: string | null;
  address: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [requested, setRequested] = useState(Boolean(feedbackRequestedAt));

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);

  function requestFeedback() {
    start(async () => {
      const r = await requestShowingFeedbackAction(clientId, showingId);
      if (!r.ok) {
        toast.show(r.error || 'Could not request feedback.', {
          variant: 'error',
        });
        return;
      }
      setRequested(true);
      toast.show(
        `Feedback requested${
          typeof r.sent === 'number' ? ` - ${r.sent} sent` : ''
        }.`,
        { variant: 'success' }
      );
      router.refresh();
    });
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      const r = await getShowingFeedbackAction(showingId);
      setLoading(false);
      if (!r.ok) {
        toast.show(r.error || 'Could not load feedback.', { variant: 'error' });
        setOpen(false);
        return;
      }
      setFeedback((r.feedback || []) as FeedbackRow[]);
      setLoaded(true);
    }
  }

  return (
    <div className="mt-1.5 border-t border-ink-100 pt-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {requested ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M3 8.5l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Requested
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={requestFeedback}
            className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
          >
            {pending && <Spinner />}
            {pending ? 'Working…' : 'Request feedback'}
          </button>
        )}
        <button
          type="button"
          onClick={toggle}
          className="rounded-md border border-ink-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-700 transition hover:bg-ink-50"
        >
          {open ? 'Hide feedback' : 'View feedback'}
        </button>
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-ink-200 bg-ink-50 p-2.5 text-[11px]">
          {loading ? (
            <div className="flex items-center gap-2 text-ink-500">
              <Spinner /> Loading feedback…
            </div>
          ) : feedback.length === 0 ? (
            <p className="text-ink-500">
              No feedback yet for {address || 'this showing'}.
            </p>
          ) : (
            <ul className="space-y-2">
              {feedback.map((f) => {
                const bits: string[] = [];
                if (f.interest && INTEREST_LABELS[f.interest])
                  bits.push(INTEREST_LABELS[f.interest]);
                if (f.price_opinion && PRICE_LABELS[f.price_opinion])
                  bits.push(PRICE_LABELS[f.price_opinion]);
                const author =
                  f.author_name || f.author_email || 'Anonymous';
                return (
                  <li
                    key={f.id}
                    className="rounded-md border border-ink-200 bg-white px-2.5 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-amber-600">
                        {starString(f.stars)}
                      </span>
                      <span className="text-ink-400">{author}</span>
                    </div>
                    {bits.length > 0 && (
                      <div className="mt-0.5 text-ink-600">
                        {bits.join(' · ')}
                      </div>
                    )}
                    {f.liked && (
                      <p className="mt-1 text-ink-700">
                        <span className="font-semibold">Liked:</span> {f.liked}
                      </p>
                    )}
                    {f.concerns && (
                      <p className="mt-0.5 text-ink-700">
                        <span className="font-semibold">Concerns:</span>{' '}
                        {f.concerns}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3 w-3 animate-spin text-ink-500"
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
