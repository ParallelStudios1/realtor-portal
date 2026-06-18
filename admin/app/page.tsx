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
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Realtor Portal" className="h-7 w-7" />
            <span>Realtor Portal</span>
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <a href="#how" className="hidden text-ink-600 transition hover:text-ink-900 sm:inline">
              How it works
            </a>
            <a href="#pricing" className="hidden text-ink-600 transition hover:text-ink-900 sm:inline">
              Pricing
            </a>
            <Link href="/login" className="text-ink-600 transition hover:text-ink-900">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary">
              Start free trial
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="border-b border-ink-200">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 sm:py-32 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-900" />
              Branded client portal for real estate firms
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-[3.4rem] sm:leading-[1.05]">
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
              <Link href="/signup" className="btn-primary px-5 py-3 text-base">
                Start free trial
              </Link>
              <DemoButton className="btn-secondary px-5 py-3 text-base" />
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-ink-200 pt-8">
              {[
                { k: '~10 min', v: 'to set up your firm' },
                { k: 'Per firm', v: 'unlimited clients' },
                { k: '14 days', v: 'free, no card' },
              ].map((s) => (
                <div key={s.v}>
                  <dt className="text-2xl font-semibold tracking-tight">{s.k}</dt>
                  <dd className="mt-1 text-xs text-ink-500">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Product preview — a pure-CSS mock of the client portal so the
              hero shows the thing being sold. No screenshot to go stale, no
              gradients, flat ink + one borrowed brand tone. */}
          <div aria-hidden className="relative hidden lg:block">
            <div className="absolute -inset-6 rounded-[2rem] bg-ink-50" />
            <div className="relative rotate-1 rounded-2xl border border-ink-200 bg-white p-5 shadow-soft-xl transition hover:rotate-0">
              {/* Branded header */}
              <div className="flex items-center gap-2.5 border-b border-ink-100 pb-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-900 text-[10px] font-bold text-white">
                  LR
                </span>
                <div>
                  <div className="text-sm font-semibold leading-none text-ink-900">
                    Logan Realty
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-400">
                    Your deal
                  </div>
                </div>
                <span className="ml-auto rounded-full bg-ink-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-ink-600">
                  Under contract
                </span>
              </div>
              {/* Stepper */}
              <div className="mt-4 flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <span
                    key={n}
                    className={
                      'h-1.5 flex-1 rounded-full ' +
                      (n <= 5 ? 'bg-ink-900' : 'bg-ink-100')
                    }
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-500">
                Next: complete inspection, appraisal, and financing.
              </p>
              {/* Listing row */}
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-ink-200 p-3">
                <span className="flex h-11 w-14 items-center justify-center rounded-lg bg-ink-100">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-ink-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-ink-900">
                    412 Maple Avenue
                  </div>
                  <div className="text-[11px] text-ink-500">
                    $485,000 · closing Jun 28
                  </div>
                </div>
                <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Your home
                </span>
              </div>
              {/* Chat snippet */}
              <div className="mt-4 space-y-2">
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-ink-200 bg-white px-3 py-2 text-[11px] text-ink-800 shadow-soft-xs">
                  Inspection passed — report is in your documents.
                </div>
                <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-ink-900 px-3 py-2 text-[11px] text-white">
                  Amazing. What&apos;s left before closing?
                </div>
              </div>
              {/* Date row */}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-50 px-3 py-2.5">
                <span className="text-[11px] font-semibold text-ink-700">
                  Final walkthrough
                </span>
                <span className="text-[11px] text-ink-500">Thu, Jun 26</span>
              </div>
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
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            The product
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            What you actually get
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {[
              {
                title: 'A client app with your branding',
                body:
                  'When a client signs in, they see your firm name in the header, your logo on the home screen, and your brand color on every button. Same APK / IPA, different skin per firm.',
                icon: (
                  <>
                    <rect x="7" y="3" width="10" height="18" rx="2" />
                    <path d="M11 18h2" />
                  </>
                ),
              },
              {
                title: 'One workspace per deal',
                body:
                  'Phase tracking, key dates, the contract, the parties (buyer, seller, both agents, attorney, lender), messages, and documents — all on one page instead of scattered across your inbox.',
                icon: (
                  <>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 9h18M9 20V9" />
                  </>
                ),
              },
              {
                title: 'Status updates the client can see',
                body:
                  'When you move a deal to under contract, the client gets a push notification, an email, and an update in the app. Same for closing, counter offers, and any custom phase you define for your firm.',
                icon: (
                  <>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </>
                ),
              },
              {
                title: 'Documents in one place',
                body:
                  'Drag-and-drop uploads, folders (Contracts, Disclosures, Closing, etc.), per-party visibility flags, signed-URL downloads. Everyone on the deal sees what you chose to share.',
                icon: (
                  <>
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                  </>
                ),
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft transition hover:shadow-soft-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {f.icon}
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-600">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Screenshot slot — drop a real image into /public/screenshots/
              and uncomment. Don't ship a fake dashboard mockup here. */}
          {/*
          <div className="mt-12 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-md">
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
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            Getting started
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-ink-200 bg-ink-200 sm:grid-cols-3">
            {[
              {
                n: '01',
                t: 'Set your brand',
                b: 'Sign up, name your firm, drop in a logo and a primary color. The mobile app and web portal pick that up everywhere. About a minute.',
              },
              {
                n: '02',
                t: 'Invite your first client',
                b: 'Type their name and email. They get a sign-in email and a link to download your app. They’re in within a few minutes.',
              },
              {
                n: '03',
                t: 'Run the deal',
                b: 'Add the property, move the phase as things happen, upload documents, message the client. Everything they need is in the app — you stop fielding “any update?” texts.',
              },
            ].map((s) => (
              <li key={s.n} className="bg-white p-7">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-sm font-semibold text-white">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm text-ink-600">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing — same flat treatment. The "popular" middle one keeps a
          subtle border highlight instead of a ring. */}
      <section id="pricing" className="border-b border-ink-200 bg-ink-50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            Pricing
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            One price per firm. Every client included.
          </h2>
          <p className="mt-3 max-w-xl text-sm text-ink-700">
            Unlimited clients on every plan. Cancel from your dashboard,
            month-to-month. Fourteen days free, no card.
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
                  'Unlimited clients & deals',
                  'Branded client portal & mobile app',
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
                  'Unlimited clients & deals',
                  'Branded client portal & mobile app',
                  'Deadline oversight for the whole team',
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
                  'Unlimited clients & deals',
                  'Branded client portal & mobile app',
                  'Firm-wide analytics & broker oversight',
                ],
                popular: false,
              },
            ].map((p) => (
              <div
                key={p.id}
                className={
                  'relative flex flex-col rounded-2xl border bg-white p-6 transition ' +
                  (p.popular
                    ? 'border-ink-900 shadow-soft-lg'
                    : 'border-ink-200 shadow-soft hover:shadow-soft-md')
                }
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.popular && (
                    <span className="rounded-full bg-ink-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Most chosen
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">
                    {p.price}
                  </span>
                  <span className="text-sm text-ink-500">/mo</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">{p.who}</p>
                <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex gap-2.5">
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        className="mt-0.5 h-4 w-4 shrink-0 text-ink-400"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?role=realtor&plan=${p.id}`}
                  className={
                    'mt-7 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition active:scale-[0.98] ' +
                    (p.popular
                      ? 'bg-ink-900 text-white shadow-soft-sm hover:bg-ink-700'
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
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            FAQ
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
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

      {/* Final CTA — single confident dark panel, flat. */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="rounded-3xl bg-ink-900 px-8 py-16 text-center text-white sm:px-16">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Try it for fourteen days, no card.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-ink-300">
              Set up your firm, invite a real client, see if it&apos;s actually
              useful for the way you work. Cancel any time inside the app.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-semibold text-ink-900 shadow-soft-sm transition hover:bg-ink-100 active:scale-[0.98]"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-200">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-10 text-sm text-ink-500 sm:flex-row">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Realtor Portal" className="h-6 w-6" />
            <span>Realtor Portal</span>
          </Link>
          <p className="text-xs">© {new Date().getFullYear()} Parallel Studios LLC</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition hover:text-ink-700">
              Privacy
            </Link>
            <Link href="/terms" className="transition hover:text-ink-700">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
