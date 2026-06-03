export const metadata = { title: 'Terms of Service · Realtor Portal' };

import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to home
        </Link>

        <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-8 shadow-soft-md sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-1 text-sm text-ink-500">Last updated: May 2026</p>

          <div className="mt-8 space-y-4 text-sm leading-relaxed text-ink-700">
            <p>
              Realtor Portal is a software-as-a-service platform for real estate firms.
              By signing up, you agree to use the service in accordance with applicable
              laws and not to misuse the system.
            </p>
            <p>
              Subscriptions are billed monthly. You may cancel at any time; cancellations take
              effect at the end of the current billing period.
            </p>
            <p>
              We provide the service &quot;as is&quot; without warranty. Our maximum liability
              for any claim is limited to the amount you paid in the prior 12 months.
            </p>
            <p>
              Questions? Email{' '}
              <a
                href="mailto:turnerlogan@parallelstudios.co"
                className="font-medium text-ink-900 underline underline-offset-2"
              >
                turnerlogan@parallelstudios.co
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
