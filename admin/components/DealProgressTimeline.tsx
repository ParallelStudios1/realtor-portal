'use client';

import { phaseLabelFor, phaseMessageFor, nextStepHintFor } from '@/lib/dealKind';

/**
 * Client-facing deal progress timeline.
 *
 * Renders the buyer/seller's transaction as a vertical, plain-language
 * timeline: where they are now and what comes next. Completed steps are
 * filled + checked, the current step is highlighted with a "what's
 * happening now" line, and future steps are muted.
 *
 * Pure presentational component - the server page (app/client/page.tsx)
 * is responsible for loading the deal phase + important_dates under the
 * client's own RLS context and passing them down. No data fetching here.
 */

import { formatDateOnlyLong } from '@/lib/dates';

export type TimelinePhase = {
  id: string;
  /** Resolved label (firm override or default). */
  label: string;
  /** Optional firm-defined "what's happening now" message for this phase. */
  message?: string;
};

export type TimelineDate = {
  id: string;
  label: string | null;
  /** ISO date string. */
  date: string;
  notes?: string | null;
};

// Canonical phase order. Must mirror the public.deal_phase enum.
export const DEAL_PHASES: { id: string; defaultLabel: string }[] = [
  { id: 'searching', defaultLabel: 'Searching' },
  { id: 'awaiting_offer', defaultLabel: 'Awaiting Offer' },
  { id: 'offer_made', defaultLabel: 'Offer Made' },
  { id: 'counter_offer', defaultLabel: 'Counter Offer' },
  { id: 'under_contract', defaultLabel: 'Under Contract' },
  { id: 'closing', defaultLabel: 'Closing' },
  { id: 'closed', defaultLabel: 'Closed!' },
];

// Sensible default "what's happening / what's next" copy, used when a firm
// hasn't defined its own phase_messages. Written in plain, calm language -
// the client should always know what the current step means for them.
const DEFAULT_MESSAGES: Record<string, string> = {
  searching:
    "We're finding and reviewing homes that fit what you're looking for. You'll see new properties here as they come in.",
  awaiting_offer:
    "You've agreed on the home you want. We're preparing your offer and getting ready to submit it to the seller.",
  offer_made:
    "Your offer is in. We're waiting to hear back from the seller - this can take anywhere from a few hours to a couple of days.",
  counter_offer:
    "The seller responded with a counter. We're reviewing the terms together and deciding on the next move.",
  under_contract:
    "Your offer was accepted and you're under contract. Inspections, appraisal, and paperwork happen during this stretch - keep an eye on your important dates.",
  closing:
    "You're in the home stretch. We're finalizing documents and coordinating with everyone to get you to the closing table.",
  closed:
    "Congratulations - the deal is done. Everything from here is yours.",
};

function resolveLabel(
  id: string,
  defaultLabel: string,
  overrides?: Record<string, string>
) {
  const v = overrides?.[id];
  return v && v.trim() ? v.trim() : defaultLabel;
}

function resolveMessage(id: string, overrides?: Record<string, string>) {
  const v = overrides?.[id];
  if (v && v.trim()) return v.trim();
  return DEFAULT_MESSAGES[id] || '';
}

function formatDate(iso: string) {
  // important_dates.date is a DATE-ONLY value - format from its literal
  // calendar day so server and client agree (no timezone shift, no hydration
  // mismatch, and no 6/5-vs-6/6 split with app/client/page.tsx).
  return formatDateOnlyLong(iso);
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M13 4.5 6.5 11 3 7.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DealProgressTimeline({
  phase,
  subphase,
  kind,
  brandColor,
  phaseLabels,
  phaseMessages,
  upcomingDates = [],
}: {
  /** Current deal phase id (e.g. 'under_contract'). */
  phase: string | null | undefined;
  /** Optional free-text status note under the current phase. */
  subphase?: string | null;
  /** 'seller' relabels the lifecycle as a listing (Active, Offer received, Sold…). */
  kind?: 'buyer' | 'seller' | 'both' | null;
  /** Firm brand color (hex). Used only for the active/completed accent. */
  brandColor?: string | null;
  /** firms.phase_labels jsonb - keyed by phase id. */
  phaseLabels?: Record<string, string>;
  /** firms.phase_messages jsonb - keyed by phase id. */
  phaseMessages?: Record<string, string>;
  /** Next few important_dates for this deal. */
  upcomingDates?: TimelineDate[];
}) {
  const accent = brandColor || '#0F172A';
  const currentIdx = DEAL_PHASES.findIndex((p) => p.id === phase);

  return (
    <section className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        Your progress
      </div>

      <ol className="mt-4">
        {DEAL_PHASES.map((p, i) => {
          const isDone = currentIdx >= 0 && i < currentIdx;
          const isCurrent = i === currentIdx;
          const isLast = i === DEAL_PHASES.length - 1;
          // Firm override wins; otherwise use the clear kind-aware label
          // ("Home search"/"Preparing offer" for buyers, "Active · Listed"…
          // for sellers) rather than the raw enum default.
          const label =
            phaseLabels && phaseLabels[p.id]
              ? phaseLabels[p.id]
              : phaseLabelFor(p.id, (kind as any) || 'buyer');

          return (
            <li key={p.id} className="relative flex gap-4">
              {/* Rail + node */}
              <div className="flex flex-col items-center">
                <span
                  className={
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' +
                    (isDone || isCurrent
                      ? 'text-white'
                      : 'border border-ink-200 bg-ink-50 text-ink-400')
                  }
                  style={
                    isDone || isCurrent
                      ? { backgroundColor: accent }
                      : undefined
                  }
                >
                  {isDone ? <CheckIcon color="#ffffff" /> : i + 1}
                </span>
                {!isLast && (
                  <span
                    className="mt-1 w-px flex-1"
                    style={{
                      minHeight: isCurrent ? '4.5rem' : '2.25rem',
                      backgroundColor: isDone ? accent : '#E2E8F0',
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div className={isLast ? 'pb-0.5' : 'pb-6'}>
                <div
                  className={
                    'text-sm leading-tight ' +
                    (isCurrent
                      ? 'font-semibold text-ink-900'
                      : isDone
                      ? 'font-medium text-ink-700'
                      : 'font-medium text-ink-400')
                  }
                >
                  {label}
                </div>

                {isCurrent && subphase && (
                  <span
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: accent + '15', color: accent }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: accent }}
                    />
                    {subphase}
                  </span>
                )}

                {isCurrent && (
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-600">
                    {kind === 'seller' &&
                    !(phaseMessages && phaseMessages[p.id])
                      ? phaseMessageFor(p.id, 'seller')
                      : resolveMessage(p.id, phaseMessages)}
                  </p>
                )}

                {isCurrent && nextStepHintFor(p.id, kind) && (
                  <p
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
                    style={{ color: accent }}
                  >
                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {nextStepHintFor(p.id, kind)}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {currentIdx < 0 && (
        <p className="mt-2 text-sm text-ink-500">
          Your timeline will appear here once your agent gets things started.
        </p>
      )}

      {upcomingDates.length > 0 && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Coming up
          </div>
          <ul className="mt-3 space-y-2.5">
            {upcomingDates.map((d) => (
              <li
                key={d.id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-sm text-ink-700">
                  {d.label || 'Upcoming date'}
                </span>
                <span className="shrink-0 text-sm font-medium text-ink-500">
                  {formatDate(d.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default DealProgressTimeline;
