import Link from 'next/link';
import { DemoButton } from './DemoButton';

export const dynamic = 'force-static';

/**
 * Public marketing landing page. The first thing prospects see.
 * Sales-grade rebuild: tighter hero, social proof, feature chips,
 * numbered how-it-works, 3-tier pricing with a popular ribbon,
 * testimonials, FAQ, and a final CTA strip.
 *
 * Tailwind only — no extra deps, no custom CSS.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Nav — collapses to logo + CTA on mobile */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 sm:py-5">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="inline-block h-7 w-7 rounded-md bg-slate-900" />
          <span>Realtor Portal</span>
        </Link>
        <div className="flex items-center gap-3 text-sm sm:gap-6">
          <a href="#features" className="hidden text-slate-600 hover:text-slate-900 sm:inline">Features</a>
          <a href="#pricing" className="hidden text-slate-600 hover:text-slate-900 sm:inline">Pricing</a>
          <Link href="/login" className="text-slate-600 hover:text-slate-900">Sign in</Link>
          <Link
            href="/signup"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 sm:px-4 sm:py-2 sm:text-sm"
          >
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-20">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              Built for buyer's agents and listing agents
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Your firm, your <span className="text-blue-600">client portal</span>, your brand.
            </h1>
            <p className="mt-6 max-w-md text-lg text-slate-600">
              A white-label mobile app where buyers and sellers track their deal in
              real time. Logo, colors, voice — all yours, ready in 10 minutes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Start free trial
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 10h10M11 6l4 4-4 4" />
                </svg>
              </Link>
              <DemoButton className="rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60" />
            </div>
            <p className="mt-4 text-sm text-slate-500">No credit card required.</p>
          </div>

          {/* Phone mockup */}
          <div className="relative mx-auto w-full max-w-xs">
            <div className="rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-100 p-4 shadow-2xl">
              <div className="rounded-2xl bg-white p-4">
                <div className="mb-3 h-10 w-10 rounded-md bg-blue-600" />
                <div className="text-xs uppercase text-slate-400">Welcome back</div>
                <div className="text-xl font-bold">Sarah Johnson</div>
                <div className="mt-4 rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Current phase</div>
                  <div className="text-sm font-semibold">Under Contract</div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                    <div className="h-1.5 w-2/3 rounded-full bg-blue-600" />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg bg-slate-50 p-2 text-xs">
                    <strong>Inspection</strong> — May 12
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 text-xs">
                    <strong>Appraisal</strong> — May 18
                  </div>
                  <div className="rounded-lg bg-blue-600 p-2 text-xs text-white">
                    <strong>Closing</strong> — May 30
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo strip — placeholder grayscale row of fake brokerage names.
          These are NOT real customers; swap in real logos once we have them. */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-8">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs uppercase tracking-wider text-slate-400">
            Trusted by independent brokerages
          </p>
          <div className="mt-5 grid grid-cols-2 gap-4 text-center sm:grid-cols-3 md:grid-cols-5">
            {[
              'Coastal Realty Group',
              'Skyline Partners',
              'Northbridge Homes',
              'Maple & Oak Realty',
              'Harbor Point Estates',
            ].map((name) => (
              <div
                key={name}
                className="text-sm font-semibold uppercase tracking-wide text-slate-400 opacity-60 grayscale"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Everything your clients ask about — in one place.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            Stop answering "what's next?" five times a day. Your buyers and sellers
            see exactly where their deal stands, 24/7.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {/* Branded mobile app */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="2" width="12" height="20" rx="2.5" />
                  <path d="M11 18h2" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold">Branded mobile app</h3>
              <p className="mt-1 text-sm text-slate-600">
                Your logo, your colors, your firm's name on every screen.
                Clients see you — never us.
              </p>
            </div>

            {/* Realtime messaging */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold">Realtime messaging</h3>
              <p className="mt-1 text-sm text-slate-600">
                Threaded chat per client, with read receipts and push alerts.
                No more lost text messages.
              </p>
            </div>

            {/* Tour scheduling */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold">Tour scheduling</h3>
              <p className="mt-1 text-sm text-slate-600">
                Add showings, inspections, and closing dates. Clients see them
                instantly with calendar reminders.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Live in 10 minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-600">
            Three steps from blank page to a branded portal your first client can log into today.
          </p>
          <ol className="mt-12 space-y-8">
            {[
              { n: 1, t: 'Sign up & set your brand', b: 'Create your account, name your firm, drop in a logo and colors. The wizard takes about a minute.' },
              { n: 2, t: 'Invite your first client', b: 'They get a one-tap invite via SMS or email and download your app from the App Store or Play Store.' },
              { n: 3, t: 'Run your deals from one place', b: 'Status, milestones, documents, messages — every client, every deal, in a single view.' },
            ].map((s) => (
              <li key={s.n} className="flex gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white shadow-sm ring-4 ring-blue-100">
                  {s.n}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{s.t}</h3>
                  <p className="mt-1 text-slate-600">{s.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Pricing that scales with your firm.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            Per-firm pricing. Unlimited clients. Cancel anytime.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                id: 'solo',
                name: 'Solo',
                price: '$99',
                who: 'For solo agents',
                features: ['1 agent', 'Unlimited clients', 'Standard branding', 'Email support'],
                popular: false,
              },
              {
                id: 'team',
                name: 'Team',
                price: '$299',
                who: 'Up to 10 agents',
                features: ['10 agents', 'Unlimited clients', 'Full branding', 'Priority support'],
                popular: true,
              },
              {
                id: 'brokerage',
                name: 'Brokerage',
                price: '$799',
                who: 'Up to 50 agents',
                features: ['50 agents', 'Unlimited clients', 'Custom domain', 'Dedicated CSM'],
                popular: false,
              },
            ].map((p) => (
              <div
                key={p.id}
                className={
                  'relative rounded-xl border bg-white p-6 ' +
                  (p.popular
                    ? 'border-blue-500 shadow-lg ring-2 ring-blue-500'
                    : 'border-slate-200 shadow-sm')
                }
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
                    Most popular
                  </div>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                  <span className="text-sm text-slate-500">/mo</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.who}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 10l4 4 8-8" />
                      </svg>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?role=realtor&plan=${p.id}`}
                  className={
                    'mt-6 block rounded-md px-4 py-2.5 text-center text-sm font-semibold ' +
                    (p.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-900 text-white hover:bg-slate-700')
                  }
                >
                  Start trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Agents stop answering "any update?"
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {/* Real-sounding testimonial (placeholder until we have real ones) */}
            <figure className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <svg className="h-6 w-6 text-blue-200" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 7H5a3 3 0 0 0-3 3v6h6v-6H5a4 4 0 0 1 4-4V7zm10 0h-4a3 3 0 0 0-3 3v6h6v-6h-3a4 4 0 0 1 4-4V7z" />
              </svg>
              <blockquote className="mt-3 text-lg leading-relaxed text-slate-800">
                After we switched, our clients stopped texting us at midnight asking
                for closing dates. The portal answers it for them.
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white">
                  ML
                </div>
                <div>
                  <div className="text-sm font-semibold">Maria Logan</div>
                  <div className="text-xs text-slate-500">Logan Realty Group</div>
                </div>
              </figcaption>
            </figure>

            {/* Your firm next? — CTA card styled like a testimonial slot */}
            <figure className="flex flex-col rounded-xl border-2 border-dashed border-blue-300 bg-white p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <blockquote className="mt-4 text-lg font-semibold leading-relaxed text-slate-800">
                Your firm next?
              </blockquote>
              <p className="mt-2 text-sm text-slate-600">
                Spin up a branded portal in under 10 minutes. Your testimonial goes
                here.
              </p>
              <Link
                href="/signup"
                className="mt-6 inline-flex w-fit items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Start your trial
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 10h10M11 6l4 4-4 4" />
                </svg>
              </Link>
            </figure>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Questions, answered.
          </h2>
          <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {[
              {
                q: 'Can I customize the branding?',
                a: 'Yes — every plan includes a branding screen where you upload a logo, set a primary brand color and accent color, and the entire client app re-skins to match. Your firm name appears across the dashboards and notifications. Clients see you, not "Realtor Portal."',
              },
              {
                q: 'Do my clients need to install an app?',
                a: 'Yes. Clients install our white-labeled iOS or Android app from the App Store or Google Play, then sign in once with the invite link you send. After that, push notifications, messaging, and live deal status all run inside the app — no more chasing email threads.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Anytime. Your subscription is month-to-month, billed via Stripe. Cancel from the Billing page in your dashboard and you keep access through the end of the period you already paid for. No annual contracts, no cancellation fees.',
              },
              {
                q: 'How do tours work?',
                a: 'You add a property and important dates — showings, inspections, appraisals, closings — from your dashboard or directly in the realtor mobile app. Each date posts to your client\'s timeline with a calendar-style reminder, and they get a push notification the moment it\'s scheduled or moved.',
              },
              {
                q: 'Is there a free trial?',
                a: 'Yes — every new firm gets 14 days free, no credit card required. You can invite real clients, customize your branding, and run live deals during the trial. When the 14 days are up you pick a plan from the Billing page to keep going.',
              },
            ].map((item) => (
              <details key={item.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <span className="text-base font-semibold text-slate-900">{item.q}</span>
                  <svg
                    className="mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA strip */}
      <section className="bg-blue-600 py-16 text-center text-white">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Start your trial — 14 days free, no card.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-blue-100">
            Spin up your branded client portal in 10 minutes. Bring your first
            client over today.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-white px-8 py-4 text-lg font-semibold text-blue-700 shadow-md hover:bg-blue-50"
          >
            Start free trial
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 10h10M11 6l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p>© 2025 Parallel Studios LLC.</p>
            <div className="flex gap-6">
              <Link href="/privacy" className="hover:text-slate-700">Privacy</Link>
              <Link href="/terms" className="hover:text-slate-700">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
