import Link from 'next/link';

export const metadata = {
  title: 'SMS notifications & consent · Realtor Portal',
  description:
    'How Parallel Studios LLC (Realtor Portal) collects consent for SMS notifications, the exact consent language used, and how to opt out.',
};

/**
 * PUBLIC page documenting our A2P SMS consent flow for toll-free verification
 * (Twilio reviews this URL). Covers: the exact verbal consent script, a
 * simulated conversation, how consent is recorded, the confirmation text, and
 * opt-out/help instructions. Listed as public in middleware.ts.
 */
export default function SmsConsentPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-400">
        Parallel Studios LLC · Realtor Portal
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        SMS notifications &amp; consent
      </h1>
      <p className="mt-4 text-ink-700">
        Realtor Portal, a product of Parallel Studios LLC, sends transactional
        text messages from the toll-free number{' '}
        <strong>+1&nbsp;(855)&nbsp;765-7815</strong> to real-estate clients who
        have consented to receive them. Messages are limited to updates about
        the client&apos;s own real-estate transaction: deal milestones,
        appointment and showing confirmations, document and signature
        reminders, and important-date reminders. Message frequency varies with
        deal activity (typically 2&ndash;8 messages per month). Message and
        data rates may apply. We never send marketing or promotional content
        to this list, and phone numbers are never sold or shared with third
        parties for marketing.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">
        How consent is collected
      </h2>
      <p className="mt-3 text-ink-700">
        Consent is collected by the client&apos;s own real-estate agent at the
        start of the engagement, in person or by phone, using the verbal
        consent script below. The agent may only enter a phone number into
        Realtor Portal after the client has agreed. Providing a phone number
        is optional - every portal feature works without SMS, and email is
        always available as an alternative.
      </p>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">
        Verbal consent script (used verbatim by agents)
      </h2>
      <blockquote className="mt-3 rounded-xl border border-ink-200 bg-ink-50 p-5 text-ink-800">
        &ldquo;Would you like to receive text-message updates about your
        transaction - things like status changes, showing confirmations, and
        document reminders - from our firm through Realtor Portal? Messages
        would come from the number +1&nbsp;(855)&nbsp;765-7815. Message
        frequency varies with your deal, and message and data rates may
        apply. You can opt out at any time by replying STOP, or reply HELP
        for help. Would you like me to turn that on for you?&rdquo;
      </blockquote>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">
        Simulated conversation
      </h2>
      <div className="mt-3 space-y-2 rounded-xl border border-ink-200 bg-white p-5 text-sm text-ink-800">
        <p>
          <strong>Agent:</strong> &ldquo;Would you like to receive
          text-message updates about your transaction - status changes,
          showing confirmations, and document reminders - from our firm
          through Realtor Portal? Messages come from
          +1&nbsp;(855)&nbsp;765-7815, frequency varies, and message and data
          rates may apply. You can reply STOP at any time to opt out, or HELP
          for help. Want me to turn that on?&rdquo;
        </p>
        <p>
          <strong>Client:</strong> &ldquo;Yes, please - texts are easiest for
          me.&rdquo;
        </p>
        <p>
          <strong>Agent:</strong> &ldquo;Great. I&apos;ve added your mobile
          number to your client profile. You&apos;ll get a confirmation text
          shortly - reply STOP at any time if you change your mind.&rdquo;
        </p>
      </div>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">
        How consent is recorded
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-700">
        <li>
          The agent records the client&apos;s consent by saving the phone
          number to the client&apos;s profile in Realtor Portal. The entry is
          timestamped and attributed to the agent who collected it, and is
          auditable in the firm&apos;s records.
        </li>
        <li>
          The first message the client receives is a confirmation text that
          identifies the firm and Realtor Portal and repeats the opt-out
          instructions: &ldquo;You&apos;re set up for transaction updates
          from [Firm] via Realtor Portal. Msg freq varies. Msg&amp;data rates
          may apply. Reply STOP to opt out, HELP for help.&rdquo;
        </li>
        <li>
          Removing the phone number from the client profile, or replying
          STOP, immediately stops all SMS to that number.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold tracking-tight">Opting out</h2>
      <p className="mt-3 text-ink-700">
        Reply <strong>STOP</strong> to any message to opt out immediately, or
        reply <strong>HELP</strong> for assistance. Clients can also ask their
        agent to remove their number, or email{' '}
        <a
          href="mailto:support@parallelstudios.co"
          className="font-semibold underline"
        >
          support@parallelstudios.co
        </a>
        . Opting out never affects access to the portal itself.
      </p>

      <p className="mt-10 text-sm text-ink-500">
        See also our{' '}
        <Link href="/privacy" className="font-semibold underline">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/terms" className="font-semibold underline">
          Terms of Service
        </Link>
        . Parallel Studios LLC · 5780 N Hillbrooke Trace, Johns Creek, GA
        30005.
      </p>
    </main>
  );
}
