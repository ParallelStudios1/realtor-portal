'use client';

import { useMemo, useState } from 'react';

/**
 * Client component for the /value/[firmSlug] seller-lead landing page.
 *
 * Three steps, single column, firm-branded header.
 *   step === 'address' — big address field
 *   step === 'range'   — show low/mid/high; the bottom of the card is
 *                        blurred behind a "see your full report" overlay
 *                        that collects name/email/phone
 *   step === 'done'    — thank-you panel
 *
 * Design rules (matches the rest of the product):
 *   - No gradients, no orbs, no glow. Flat color.
 *   - Inter (loaded globally).
 *   - One accent color = firm's brand_color.
 *   - "Powered by Realtor Portal" footer.
 */

type Props = {
  firmId: string;
  firmName: string;
  firmBrandColor: string;
  firmLogoUrl: string | null;
};

type Estimate = {
  mid: number;
  low: number;
  high: number;
  comps_count: number;
  city: string | null;
  address: string;
};

type Step = 'address' | 'range' | 'done';

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function ValueClient({
  firmId,
  firmName,
  firmBrandColor,
  firmLogoUrl,
}: Props) {
  const [step, setStep] = useState<Step>('address');
  const [address, setAddress] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submittingEstimate, setSubmittingEstimate] = useState(false);

  // Lead capture fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [leadError, setLeadError] = useState<string | null>(null);
  const [submittingLead, setSubmittingLead] = useState(false);

  // Pick a readable text color (black or white) against the firm's brand
  // color. Cheap luminance check — good enough; we don't need WCAG AAA here.
  const headerTextColor = useMemo(
    () => readableTextColor(firmBrandColor),
    [firmBrandColor]
  );

  async function onSubmitAddress(e: React.FormEvent) {
    e.preventDefault();
    setEstimateError(null);
    const trimmed = address.trim();
    if (trimmed.length < 6) {
      setEstimateError('Please enter a full street address.');
      return;
    }
    setSubmittingEstimate(true);
    try {
      const r = await fetch('/api/value/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: trimmed, firmId }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEstimateError(json?.error || 'Could not estimate that address.');
        setSubmittingEstimate(false);
        return;
      }
      setEstimate(json as Estimate);
      setStep('range');
    } catch (err: any) {
      setEstimateError(err?.message || 'Network error. Try again.');
    } finally {
      setSubmittingEstimate(false);
    }
  }

  async function onSubmitLead(e: React.FormEvent) {
    e.preventDefault();
    setLeadError(null);
    if (!email.trim() && !phone.trim()) {
      setLeadError('Add an email or phone so we can send your full report.');
      return;
    }
    if (!estimate) {
      setLeadError('Missing estimate. Refresh and try again.');
      return;
    }
    setSubmittingLead(true);
    try {
      const r = await fetch('/api/value/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firmId,
          address: estimate.address,
          mid: estimate.mid,
          low: estimate.low,
          high: estimate.high,
          name: name.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLeadError(json?.error || 'Could not submit. Try again.');
        setSubmittingLead(false);
        return;
      }
      setStep('done');
    } catch (err: any) {
      setLeadError(err?.message || 'Network error. Try again.');
    } finally {
      setSubmittingLead(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink-50 text-ink-900">
      {/* Firm-branded header — small logo + name in the firm's brand color. */}
      <header
        className="border-b border-ink-200"
        style={{ backgroundColor: firmBrandColor, color: headerTextColor }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-6 py-5">
          {firmLogoUrl ? (
            // Plain img — the page is public and we don't need next/image
            // optimization for a tiny logo. Avoids the Image domain config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firmLogoUrl}
              alt={firmName}
              className="h-8 w-8 rounded-md bg-white object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="inline-block h-7 w-7 rounded-md"
              style={{
                backgroundColor:
                  headerTextColor === '#FFFFFF'
                    ? 'rgba(255,255,255,0.18)'
                    : 'rgba(15,23,42,0.12)',
              }}
            />
          )}
          <div className="text-base font-semibold tracking-tight">
            {firmName}
          </div>
        </div>
      </header>

      {/* Step indicator + body */}
      <div className="mx-auto max-w-2xl px-6 py-12">
        <StepIndicator step={step} brand={firmBrandColor} />

        {step === 'address' && (
          <section className="mt-8">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              What&rsquo;s your home worth?
            </h1>
            <p className="mt-3 text-base text-ink-700">
              Enter your address and we&rsquo;ll pull a value range based on
              recent comparable sales. Free, no signup required to see the
              range.
            </p>

            <form onSubmit={onSubmitAddress} className="mt-8 space-y-4">
              <label className="block">
                <span className="block text-sm font-medium text-ink-700">
                  Property address
                </span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, Boston, MA 02118"
                  autoComplete="street-address"
                  autoFocus
                  className="mt-2 block w-full rounded-md border border-ink-300 bg-white px-4 py-3 text-base text-ink-900 shadow-soft-xs placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
                />
              </label>

              {estimateError && (
                <p className="text-sm text-red-600">{estimateError}</p>
              )}

              <button
                type="submit"
                disabled={submittingEstimate}
                className="inline-flex w-full items-center justify-center rounded-md px-5 py-3 text-base font-medium text-white shadow-soft-sm transition disabled:opacity-60"
                style={{ backgroundColor: firmBrandColor }}
              >
                {submittingEstimate ? 'Estimating…' : 'Get my estimate'}
              </button>
              <p className="text-center text-xs text-ink-500">
                Takes about ten seconds. We don&rsquo;t share your address.
              </p>
            </form>
          </section>
        )}

        {step === 'range' && estimate && (
          <section className="mt-8">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Your estimated value
            </h1>
            <p className="mt-2 text-sm text-ink-600">
              {estimate.address}
            </p>

            {/* Range card */}
            <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-md">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Estimated value range
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span
                  className="text-4xl font-semibold tracking-tight sm:text-5xl"
                  style={{ color: firmBrandColor }}
                >
                  {fmtUsd(estimate.mid)}
                </span>
              </div>
              <div className="mt-1 text-sm text-ink-600">
                Low {fmtUsd(estimate.low)} &middot; High {fmtUsd(estimate.high)}
              </div>

              {/* Range bar — flat, no gradient. */}
              <div className="mt-5">
                <div className="relative h-2 rounded-full bg-ink-100">
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: '8%',
                      right: '8%',
                      backgroundColor: firmBrandColor,
                      opacity: 0.85,
                    }}
                  />
                  <div
                    className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                    style={{ left: '50%', backgroundColor: firmBrandColor }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px] font-medium text-ink-500">
                  <span>Low</span>
                  <span>Mid</span>
                  <span>High</span>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-600">
                <span>
                  Based on <strong>{estimate.comps_count}</strong> recent
                  comparable sales
                  {estimate.city ? ` in ${estimate.city}` : ''}.
                </span>
              </div>
              {/* Required disclosure: this is an algorithmic neighborhood
                  estimate, NOT a real appraisal. A real CMA from the
                  realtor will look at the actual home's condition, recent
                  updates, comps within a half-mile, and current market
                  velocity. Without this line, we're misleading sellers. */}
              <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                This is an automated neighborhood estimate &mdash; not an
                appraisal. The realtor will pull a full Comparative Market
                Analysis (CMA) using your home&apos;s actual condition,
                upgrades, and the most recent comparable sales when you
                request the full report.
              </p>
            </div>

            {/* Lead capture — sits below the range. Blurred preview of the
                "full report" sits behind a clear overlay form so the visitor
                immediately sees what they're getting in exchange. */}
            <div className="relative mt-8 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-soft-md">
              {/* Blurred faux-report behind the overlay. Keeps it interesting
                  to look at without faking specific numbers. */}
              <div
                aria-hidden
                className="select-none px-6 py-6 [filter:blur(6px)]"
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                  Full report
                </div>
                <div className="mt-2 h-5 w-2/3 rounded bg-ink-200" />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="h-16 rounded bg-ink-100" />
                  <div className="h-16 rounded bg-ink-100" />
                  <div className="h-16 rounded bg-ink-100" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-ink-100" />
                  <div className="h-3 w-11/12 rounded bg-ink-100" />
                  <div className="h-3 w-9/12 rounded bg-ink-100" />
                  <div className="h-3 w-10/12 rounded bg-ink-100" />
                </div>
              </div>

              {/* Overlay form */}
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                <form
                  onSubmit={onSubmitLead}
                  className="w-full max-w-md space-y-3 px-6 py-6"
                >
                  <h2 className="text-lg font-semibold tracking-tight">
                    See your full report
                  </h2>
                  <p className="text-sm text-ink-600">
                    Comparable sales, price history, neighborhood trend, and
                    a personal walk-through from a {firmName} agent. Free.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
                    />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone"
                      autoComplete="tel"
                      className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
                    />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    className="block w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10"
                  />

                  {leadError && (
                    <p className="text-sm text-red-600">{leadError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submittingLead}
                    className="inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-soft-sm transition disabled:opacity-60"
                    style={{ backgroundColor: firmBrandColor }}
                  >
                    {submittingLead ? 'Sending…' : 'Send my full report'}
                  </button>
                  <p className="text-center text-[11px] text-ink-500">
                    By submitting you agree to be contacted by {firmName} about
                    your property. No spam.
                  </p>
                </form>
              </div>
            </div>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setEstimate(null);
                  setStep('address');
                }}
                className="text-sm text-ink-500 underline-offset-4 hover:text-ink-700 hover:underline"
              >
                Try a different address
              </button>
            </div>
          </section>
        )}

        {step === 'done' && estimate && (
          <section className="mt-8 rounded-2xl border border-ink-200 bg-white p-8 shadow-soft-md">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Thanks{name ? `, ${name.split(' ')[0]}` : ''}.
            </h1>
            <p className="mt-3 text-base text-ink-700">
              Your full report for <strong>{estimate.address}</strong> is on the
              way. A {firmName} agent will follow up shortly with the
              comparable sales and a no-pressure walk-through of what your
              home would list for today.
            </p>
            <div className="mt-6 rounded-md bg-ink-50 px-4 py-3 text-sm text-ink-700">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                Your estimated value
              </div>
              <div
                className="mt-1 text-2xl font-semibold tracking-tight"
                style={{ color: firmBrandColor }}
              >
                {fmtUsd(estimate.mid)}
              </div>
              <div className="text-xs text-ink-500">
                Range {fmtUsd(estimate.low)} – {fmtUsd(estimate.high)}
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="border-t border-ink-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-6 text-xs text-ink-500">
          <span>
            © {new Date().getFullYear()} {firmName}
          </span>
          <span>
            Powered by{' '}
            <a
              href="/"
              className="font-medium text-ink-700 hover:text-ink-900"
            >
              Realtor Portal
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

/**
 * Tiny step indicator — three dots, current one filled with the firm's
 * brand color. Skip on the 'done' step since the flow is over.
 */
function StepIndicator({ step, brand }: { step: Step; brand: string }) {
  const order: Step[] = ['address', 'range', 'done'];
  const idx = order.indexOf(step);
  return (
    <ol className="flex items-center gap-2 text-xs text-ink-500">
      {order.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: i <= idx ? brand : '#CBD5E1',
            }}
          />
          {i < order.length - 1 && (
            <span aria-hidden className="inline-block h-px w-6 bg-ink-200" />
          )}
        </li>
      ))}
      <li className="ml-2 font-medium text-ink-600">
        Step {idx + 1} of {order.length}
      </li>
    </ol>
  );
}

/**
 * Pick black or white text against a given background hex so the firm name
 * stays readable regardless of whatever color they picked. Standard YIQ
 * luminance — not WCAG-perfect but fine for header text on a saturated bg.
 */
function readableTextColor(hex: string): string {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#FFFFFF';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#0F172A' : '#FFFFFF';
}
