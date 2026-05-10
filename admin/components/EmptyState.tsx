import Link from 'next/link';
import React from 'react';

/**
 * Inline SVG icons in a Heroicons-ish outline style. Defined locally so we
 * don't have to add a Heroicons dependency. The outer EmptyState wraps them
 * in a tinted circle.
 */
const ICONS = {
  users: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  ),
  chat: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3a48.6 48.6 0 0 1-3.476-.083c-.55-.041-.95-.5-1.02-1.024M15.75 8.511V6.375c0-1.243-.96-2.25-2.143-2.25H4.393C3.21 4.125 2.25 5.132 2.25 6.375v6.75c0 1.243.96 2.25 2.143 2.25h.95c.394 0 .744.25.882.625L7.5 18.75v-2.625c0-.345.293-.625.643-.625h6.964c1.184 0 2.143-1.007 2.143-2.25V8.511Z"
    />
  ),
  calendar: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
    />
  ),
  home: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  ),
  document: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
    />
  ),
} as const;

export type EmptyStateIcon = keyof typeof ICONS;

/**
 * Polished empty state: tinted circle with Heroicons-style svg, a headline,
 * a one-liner of subtext, and an optional CTA (link or button).
 */
export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  ctaHref,
  onCtaClick,
}: {
  icon: EmptyStateIcon;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
}) {
  const cta = ctaLabel
    ? ctaHref
      ? (
          <Link
            href={ctaHref}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            {ctaLabel}
          </Link>
        )
      : (
          <button
            type="button"
            onClick={onCtaClick}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            {ctaLabel}
          </button>
        )
    : null;

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 ring-1 ring-blue-100">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-7 w-7 text-blue-600"
          aria-hidden="true"
        >
          {ICONS[icon]}
        </svg>
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      {body && (
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{body}</p>
      )}
      {cta}
    </div>
  );
}
