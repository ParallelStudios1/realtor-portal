import Link from 'next/link';

export const dynamic = 'force-static';

/**
 * Public marketing landing page. The first thing prospects see.
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="inline-block h-7 w-7 rounded-md bg-slate-900" />
          Realtor Portal
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <a href="#features" className="text-slate-600 hover:text-slate-900">Features</a>
          <a href="#pricing" className="text-slate-600 hover:text-slate-900">Pricing</a>
          <Link href="/login" className="text-slate-600 hover:text-slate-900">Sign in</Link>
          <Link
            href="/signup"
            className="rounded-md bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
          >
            Start free trial
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:pt-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="inline-block rounded-full border border-slate-200 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
              Built for modern brokerages
            </span>
            <h1 className="mt-5 text-5xl font-bold leading-tight tracking-tight md:text-6xl">
              Your firm's<br />
              <span className="text-blue-600">client portal</span>,<br />
              ready in 10 minutes.
            </h1>
            <p className="mt-6 max-w-md text-lg text-slate-600">
              A white-label mobile app where buyers and sellers track their deal in
              real time. Your logo, your colors, your brand — no app development required.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-md bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-700"
              >
                Start free 14-day trial
              </Link>
              <a
                href="#how-it-works"
                className="rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:border-slate-400"
              >
                See how it works
              </a>
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

      {/* Features */}
      <section id="features" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Everything your clients ask about — in one place.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            Stop answering "what's next?" five times a day. Your buyers and sellers
            see exactly where their deal stands, 24/7.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                title: 'Live deal timeline',
                body: 'Inspection, appraisal, financing, closing — every milestone with dates and status.',
                icon: '📅',
              },
              {
                title: 'House watchlist',
                body: 'Clients tour homes, leave 1-5 star ratings, and track favorites. You see what they actually love.',
                icon: '🏠',
              },
              {
                title: 'Document vault',
                body: 'Disclosures, contracts, inspection reports — uploaded once, accessible forever.',
                icon: '📄',
              },
              {
                title: 'In-app messaging',
                body: 'Threaded chat per client, with read receipts. No more lost text messages.',
                icon: '💬',
              },
              {
                title: 'Push notifications',
                body: 'Clients get alerts the second a milestone moves or a document drops.',
                icon: '🔔',
              },
              {
                title: 'Your brand, not ours',
                body: 'Upload your logo and colors. Clients see your firm — not "Realtor Portal."',
                icon: '🎨',
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Live in 10 minutes.
          </h2>
          <ol className="mt-12 space-y-8">
            {[
              { n: 1, t: 'Sign up & name your firm', b: 'Create your account, name your brokerage. Done.' },
              { n: 2, t: 'Upload logo & pick colors', b: 'A 60-second wizard turns the app into your brand.' },
              { n: 3, t: 'Invite your first client', b: 'They get a one-tap invite via SMS or email.' },
              { n: 4, t: 'Track every deal in real time', b: 'Status, dates, documents, messages — all in one place.' },
            ].map((s) => (
              <li key={s.n} className="flex gap-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 font-bold text-white">
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
      <section id="pricing" className="border-t border-slate-100 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            Pricing that scales with your firm.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
            Per-firm pricing. Unlimited clients. Cancel anytime.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              { name: 'Solo', price: '$99', sub: '/month', who: 'For solo agents', features: ['1 agent', 'Unlimited clients', 'Standard branding', 'Email support'] },
              { name: 'Team', price: '$299', sub: '/month', who: 'Up to 10 agents', features: ['10 agents', 'Unlimited clients', 'Full branding', 'Priority support'] },
              { name: 'Brokerage', price: '$799', sub: '/month', who: 'Up to 50 agents', features: ['50 agents', 'Unlimited clients', 'Custom domain', 'Dedicated CSM'] },
              { name: 'Enterprise', price: 'Talk to us', sub: '', who: '50+ agents', features: ['Unlimited agents', 'White-label app store listing', 'SSO + audit logs', 'SLA'] },
            ].map((p, i) => (
              <div
                key={p.name}
                className={
                  'rounded-xl border bg-white p-6 ' +
                  (i === 1 ? 'border-blue-500 shadow-lg ring-2 ring-blue-500' : 'border-slate-200')
                }
              >
                {i === 1 && (
                  <div className="mb-2 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                    Most popular
                  </div>
                )}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className="text-sm text-slate-500">{p.sub}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.who}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <span className="text-emerald-500">✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={
                    'mt-6 block rounded-md px-4 py-2 text-center text-sm font-semibold ' +
                    (i === 1
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-100 text-slate-900 hover:bg-slate-200')
                  }
                >
                  Start trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Stop being the deal status hotline.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Get a branded client portal that answers the questions for you.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-slate-900 px-8 py-4 text-lg font-semibold text-white hover:bg-slate-700"
          >
            Start your free trial →
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10 text-center text-sm text-slate-500">
        <div className="mx-auto max-w-6xl px-6">
          <p>© {new Date().getFullYear()} Parallel Studios · Realtor Portal</p>
          <div className="mt-3 flex justify-center gap-6">
            <Link href="/privacy" className="hover:text-slate-700">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-700">Terms</Link>
            <a href="mailto:turnerlogan@parallelstudios.co" className="hover:text-slate-700">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
