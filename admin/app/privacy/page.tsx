export const metadata = { title: 'Privacy Policy · Realtor Portal' };

import Link from 'next/link';

export default function PrivacyPage() {
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
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-1 text-sm text-ink-500">Last updated: May 2026</p>

          <div className="mt-8 space-y-4 text-sm leading-relaxed text-ink-700">
            <p>
              Realtor Portal is operated by Parallel Studios. We collect only the information
              necessary to provide a client portal experience for real estate transactions:
              name, email, phone, transaction details, documents you upload, and basic usage
              analytics.
            </p>
            <p>
              <strong className="text-ink-900">We do not sell your data.</strong> We do not
              share data between firms. Each firm is an isolated tenant — their clients&apos;
              data is invisible to other firms.
            </p>
            <p>
              You can request a full export or deletion of your data at any time by emailing{' '}
              <a
                href="mailto:turnerlogan@parallelstudios.co"
                className="font-medium text-ink-900 underline underline-offset-2"
              >
                turnerlogan@parallelstudios.co
              </a>
              .
            </p>

            <h2
              id="sms"
              className="scroll-mt-24 pt-4 text-lg font-bold tracking-tight text-ink-900"
            >
              SMS / Text Messaging
            </h2>
            <p>
              Realtor Portal (operated by Parallel Studios LLC) sends transactional
              text messages on behalf of the real estate firm you are working with.
              These messages relate only to your transaction — for example: deal
              status and phase updates, tour requests and confirmations, important
              dates and deadline reminders, document and e-signature notifications,
              and direct messages from your agent or another party on your deal. We
              do not send marketing or promotional text messages.
            </p>
            <p>
              <strong className="text-ink-900">Consent (opt-in).</strong> You opt in
              to receive these texts when you provide your mobile number to your
              agent or enter it in the portal in connection with a transaction you
              are part of. Providing your number is voluntary and is not a condition
              of any purchase. Message frequency varies based on activity on your
              deal.
            </p>
            <p>
              <strong className="text-ink-900">Rates.</strong> Message and data rates
              may apply, depending on your mobile carrier and plan.
            </p>
            <p>
              <strong className="text-ink-900">Opt-out and help.</strong> You can opt
              out of text messages at any time by replying{' '}
              <span className="font-mono text-ink-900">STOP</span> to any message;
              you will receive a single confirmation and no further texts. Reply{' '}
              <span className="font-mono text-ink-900">HELP</span> for help, or
              contact{' '}
              <a
                href="mailto:turnerlogan@parallelstudios.co"
                className="font-medium text-ink-900 underline underline-offset-2"
              >
                turnerlogan@parallelstudios.co
              </a>
              .
            </p>
            <p>
              <strong className="text-ink-900">
                We never share your mobile number or messaging consent with third
                parties for their own marketing,
              </strong>{' '}
              and we do not share it between firms. Carriers are not liable for
              delayed or undelivered messages.
            </p>

            <p>
              For full terms, see{' '}
              <Link href="/terms" className="font-medium text-ink-900 underline underline-offset-2">
                our Terms
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
