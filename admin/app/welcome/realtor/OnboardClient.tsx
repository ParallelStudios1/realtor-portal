'use client';

import { useState } from 'react';
import { completeRealtorOnboardingAction } from './actions';

/**
 * Cross-firm realtor onboarding form. Pre-fills name + firm name from
 * what we already know about the invitee (Supabase user_metadata.full_name,
 * email domain → suggested firm). Realtor confirms or edits, hits one
 * button, lands on the deal.
 *
 * Explains the "guest pass" perks deal so it's clear what they're getting
 * (premium features on this specific deal because the host firm pays;
 * free trial for everything else).
 */
export function OnboardClient({
  email,
  defaultFullName,
  defaultFirmName,
  hostFirmName,
  next,
}: {
  email: string;
  defaultFullName: string;
  defaultFirmName: string;
  hostFirmName: string | null;
  next: string;
}) {
  const [fullName, setFullName] = useState(defaultFullName);
  const [firmName, setFirmName] = useState(defaultFirmName);

  return (
    <main className="min-h-screen bg-ink-50 py-12">
      <div className="mx-auto max-w-md px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-soft-lg">
          <div className="mb-3 flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg" />
            <span className="text-sm font-bold tracking-tight">
              Realtor Portal
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            You&rsquo;re in. Set up your account.
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            {hostFirmName ? (
              <>
                <strong>{hostFirmName}</strong> invited you to co-broker a deal.{' '}
              </>
            ) : null}
            We&rsquo;ll create your own firm so you have a place to land. Free
            trial &mdash; no card needed.
          </p>

          <form
            action={completeRealtorOnboardingAction}
            className="mt-6 space-y-4"
          >
            <input type="hidden" name="next" value={next} />
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input
                value={email}
                disabled
                className="mt-1.5 w-full rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700"
              />
            </div>
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium">
                Your name
              </label>
              <input
                id="full_name"
                name="full_name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input mt-1.5"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label htmlFor="firm_name" className="block text-sm font-medium">
                Your firm or brokerage
              </label>
              <input
                id="firm_name"
                name="firm_name"
                required
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                className="input mt-1.5"
                placeholder="Acme Realty"
              />
              <p className="mt-1 text-xs text-ink-500">
                If you don&rsquo;t have one, put your own name. You can change
                it later in Settings.
              </p>
            </div>

            {/* The "guest pass" callout. Make the trade explicit so they
                don't feel rug-pulled later when they try to use the product
                for their own deals. */}
            <div className="rounded-lg border border-ink-200 bg-ink-100/60 p-3 text-xs text-ink-900">
              <p className="font-semibold">How this works</p>
              <ul className="mt-1.5 space-y-1 list-disc pl-4">
                <li>
                  Premium features on this deal are covered by the host firm.
                </li>
                <li>
                  Your own firm starts on a free trial &mdash; use it for your
                  own clients, deals, and listings.
                </li>
                <li>
                  When the trial ends, you pick a plan only if you want to keep
                  using Realtor Portal for your own clients.
                </li>
              </ul>
            </div>

            <button
              type="submit"
              className="btn-primary mt-2 w-full"
            >
              Open the deal &rarr;
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
