import Link from 'next/link';
import { DemoButton } from './DemoButton';

export const dynamic = 'force-static';
export const metadata = {
  title: 'Realtor Portal',
  description:
    'A branded client portal for real estate firms. Buyers and sellers see their deal in your app, with your logo and colors.',
};

/**
 * Landing page — flat design, plain copy.
 *
 * Hard rules followed here (from Turner):
 *   - One flat background color, one accent. No gradients, no glassmorphism,
 *     no blur orbs, no glow.
 *   - No fake testimonials, no fake logos, no fake stats. We only show
 *     numbers Turner gives us; until then we show none.
 *   - No "empower / unleash / revolutionize / supercharge". No rocket /
 *     sparkle / lightbulb emojis. Copy reads like a person describing the
 *     product to a friend.
 *   - Real screenshot placeholder instead of a generic "feature cards" row.
 *   - One typeface (Inter, loaded via next/font in app/layout.tsx).
 *   - 1.5–1.6 line-height on body. Consistent 80–96px section padding.
 *
 * If you find anything here that exists only because it looks cool in a
 * Tailwind demo, delete it.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900 antialiased leading-[1.6]">
      {/* Nav */}
      <header className="border-b border-ink-200">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="inline-block h-6 w-6 rounded-sm bg-ink-900" />
            <span>Realtor Portal</span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <a href="#how" className="hidden text-ink-600 hover:text-ink-900 sm:inline">
              How it works
            </a>
            <a href="#pricing" className="hidden text-ink-600 hover:text-ink-900 sm:inline">
              Pricing
            </a>
            <Link href="/login" className="text-ink-600 hover:text-ink-900">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-ink-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-ink-700"
            >
              Start free trial
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="border-b border-ink-200">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Your buyers and sellers stop asking &ldquo;any update?&rdquo;
            </h1>
            <p className="mt-6 text-lg text-ink-700">
              Realtor Portal is a branded mobile app and web portal you give
              your clients. They open it and see exactly where their deal stands:
              the property, the phase, the upcoming dates, the documents you
              shared. Your logo, your name, your firm&apos;s colors — not ours.
            </p>
            <p className="mt-4 text-base text-ink-600">
              It takes about ten minutes to set up. Pricing is per firm, not
              per client. Fourteen days free, no card.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-md bg-ink-900 px-5 py-3 text-base font-medium text-white hover:bg-ink-700"
              >
                Start free trial
              </Link>
              <DemoButton className="inline-flex items-center rounded-md border border-ink-300 bg-white px-5 py-3 text-base font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60" />
            </div>
          </div>
        </div>
      </section>

      {/* Real product evidence — replaces the generic three-cards row.
          A real screenshot lives at /screenshots/deal-workspace.png. Drop
          one in there or replace the next block with a Loom embed. Until
          there's something concrete to show, this section stays text-only
          rather than a placeholder graphic. */}
      <section className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What you actually get
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold">A client app with your branding</h3>
              <p className="mt-2 text-sm text-ink-700">
                When a client signs in, they see your firm name in the header,
                your logo on the home screen, and your brand color on every
                button. Same APK / IPA, different skin per firm.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold">One workspace per deal</h3>
              <p className="mt-2 text-sm text-ink-700">
                Phase tracking, key dates, the contract, the parties (buyer,
                seller, both agents, attorney, lender), messages, and
                documents — all on one page instead of scattered across your
                inbox.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold">Status updates the client can see</h3>
              <p className="mt-2 text-sm text-ink-700">
                When you move a deal to under contract, the client gets a
                push notification, an email, and a celebration message in
                the app. Same for closing, counter offers, and any custom
                phase you define for your firm.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold">Documents in one place</h3>
              <p className="mt-2 text-sm text-ink-700">
                Drag-and-drop uploads, folders (Contracts, Disclosures,
                Closing, etc.), per-party visibility flags, signed-URL
                downloads. Everyone on the deal sees what you chose to share.
              </p>
            </div>
          </div>

          {/* Screenshot slot — drop a real image into /public/screenshots/
              and uncomment. Don't ship a fake dashboard mockup here. */}
          {/*
          <div className="mt-12 overflow-hidden rounded-lg border border-ink-200 bg-white">
            <img
              src="/screenshots/deal-workspace.png"
              alt="The deal workspace inside Realtor Portal"
              className="block w-full"
            />
          </div>
          */}
        </div>
      </section>

      {/* How it works — three steps, no decorative icons. */}
      <section id="how" className="border-b border-ink-200">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-10 space-y-8">
            <li className="grid gap-4 sm:grid-cols-[3rem_1fr]">
              <div className="text-xl font-semibold text-ink-400">01</div>
              <div>
                <h3 className="text-base font-semibold">Set your brand</h3>
                <p className="mt-2 text-sm text-ink-700">
                  Sign up, name your firm, drop in a logo and a primary color.
                  The mobile app and web portal pick that up everywhere. About
                  a minute.
                </p>
              </div>
            </li>
            <li className="grid gap-4 sm:grid-cols-[3rem_1fr]">
              <div className="text-xl font-semibold text-ink-400">02</div>
              <div>
                <h3 className="text-base font-semibold">Invite your first client</h3>
                <p className="mt-2 text-sm text-ink-700">
                  Type their name and email. They get a sign-in email and a
                  link to download your app. They&apos;re in within a few minutes.
                </p>
              </div>
            </li>
            <li className="grid gap-4 sm:grid-cols-[3rem_1fr]">
              <div className="text-xl font-semibold text-ink-400">03</div>
              <div>
                <h3 className="text-base font-semibold">Run the deal</h3>
                <p className="mt-2 text-sm text-ink-700">
                  Add the property, move the phase as things happen, upload
                  documents, message the client. Everything they need is in
                  the app — you stop fielding &ldquo;any update?&rdquo; texts.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Pricing — same flat treatment. The "popular" middle one keeps a
          subtle border highlight instead of a ring. */}
      <section id="pricing" className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Pricing
          </h2>
          <p className="mt-3 max-w-xl text-sm text-ink-700">
            Per-firm pricing. Unlimited clients on every plan. Cancel from your
            dashboard, month-to-month. Fourteen days free, no card.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                id: 'solo',
                name: 'Solo',
                price: '$99',
                who: 'For a single agent',
                features: [
                  '1 agent seat',
                  'Unlimited clients',
                  'Standard branding (logo, primary color)',
                  'Email support',
                ],
                popular: false,
              },
              {
                id: 'team',
                name: 'Team',
                price: '$299',
                who: 'Up to 10 agents on one firm',
                features: [
                  '10 agent seats',
                  'Unlimited clients',
                  'Full branding (accent color, custom domain coming)',
                  'Priority support',
                ],
                popular: true,
              },
              {
                id: 'brokerage',
                name: 'Brokerage',
                price: '$799',
                who: 'Up to 50 agents',
                features: [
                  '50 agent seats',
                  'Unlimited clients',
                  'Custom subdomain',
                  'Dedicated onboarding',
                ],
                popular: false,
              },
            ].map((p) => (
              <div
                key={p.id}
                className={
                  'rounded-lg border bg-white p-6 ' +
                  (p.popular ? 'border-ink-900' : 'border-ink-200')
                }
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.popular && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                      Most chosen
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">
                    {p.price}
                  </span>
                  <span className="text-sm text-ink-500">/mo</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">{p.who}</p>
                <ul className="mt-5 space-y-2 text-sm text-ink-700">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex gap-2">
                      <span aria-hidden className="text-ink-400">·</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?role=realtor&plan=${p.id}`}
                  className={
                    'mt-6 block rounded-md px-4 py-2.5 text-center text-sm font-medium ' +
                    (p.popular
                      ? 'bg-ink-900 text-white hover:bg-ink-700'
                      : 'border border-ink-300 text-ink-700 hover:bg-ink-50')
                  }
                >
                  Start trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — plain accordion, no flourish. */}
      <section className="border-b border-ink-200">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Questions people ask
          </h2>
          <div className="mt-8 divide-y divide-ink-200 border-y border-ink-200">
            {[
              {
                q: 'Can I really brand it as my firm?',
                a: 'Yes. Logo, firm name, primary color, accent color, contact info — all picked up from your dashboard and applied everywhere the client sees. The app store listing still says Realtor Portal, but inside the app the client sees your firm.',
              },
              {
                q: 'Do my clients have to install something?',
                a: 'For mobile, yes. They install our iOS/Android app from the App Store or Google Play and sign in with the email you invited them with. There is also a web portal at the same URL you use, so a client can open the link from email on their computer and use everything from a browser.',
              },
              {
                q: 'How does billing work?',
                a: 'Month-to-month, billed via Stripe. Cancel from the Billing page in your dashboard. You keep access through the end of the period you already paid for. No annual contracts, no cancellation fees.',
              },
              {
                q: 'What happens during the free trial?',
                a: 'You get fourteen days with no card on file. Invite real clients, brand the app, run live deals. When the trial ends you pick a plan from Billing. If you don’t, the app pauses messaging, document uploads, and new client invites until you pick one — existing data stays intact.',
              },
              {
                q: 'Can the other agent’s realtor use this too?',
                a: 'Yes, even if their firm doesn’t pay. The paying realtor invites them to a specific deal as a co-realtor; they can work on that one deal without their own subscription. If they want their own client portal, they sign up separately.',
              },
            ].map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <span className="text-base font-medium">{item.q}</span>
                  <span
                    aria-hidden
                    className="mt-1 text-ink-500 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-ink-700">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA — single accent, flat. */}
      <section>
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Try it for fourteen days, no card.
          </h2>
          <p className="mt-3 text-sm text-ink-700">
            Set up your firm, invite a real client, see if it&apos;s actually
            useful for the way you work. Cancel any time inside the app.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center rounded-md bg-ink-900 px-5 py-3 text-base font-medium text-white hover:bg-ink-700"
          >
            Start free trial
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-200">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-ink-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Parallel Studios LLC</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-ink-700">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink-700">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
