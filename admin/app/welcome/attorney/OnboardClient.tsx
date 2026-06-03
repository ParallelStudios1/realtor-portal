'use client';

import { useState } from 'react';
import { completeAttorneyOnboardingAction } from './actions';

/**
 * Attorney onboarding form — minimal. We only need their name; the firm
 * they're attached to comes from the invite (host_firm). No password
 * setup (they signed in via magic link).
 */
export function AttorneyOnboardClient({
  email,
  defaultFullName,
  hostFirmName,
  hostFirmId,
  next,
}: {
  email: string;
  defaultFullName: string;
  hostFirmName: string | null;
  hostFirmId: string | null;
  next: string;
}) {
  const [fullName, setFullName] = useState(defaultFullName);
  return (
    <main className="min-h-screen bg-ink-50 py-12">
      <div className="mx-auto max-w-md px-6">
        <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-soft-lg">
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-block h-7 w-7 rounded-lg bg-ink-900" />
            <span className="text-sm font-bold tracking-tight">
              Realtor Portal
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            You&rsquo;re in. Let&rsquo;s finish your attorney setup.
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            {hostFirmName ? (
              <>
                <strong>{hostFirmName}</strong> added you as the attorney on a
                deal.{' '}
              </>
            ) : null}
            We&rsquo;ll drop you into the attorney dashboard once you confirm
            your name.
          </p>

          <form
            action={completeAttorneyOnboardingAction}
            className="mt-6 space-y-4"
          >
            <input type="hidden" name="next" value={next} />
            {hostFirmId && (
              <input type="hidden" name="host_firm" value={hostFirmId} />
            )}
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
                placeholder="Jane Smith, Esq."
              />
            </div>
            <div className="rounded-lg border border-ink-200 bg-ink-100/60 p-3 text-xs text-ink-900">
              <p className="font-semibold">Your attorney dashboard</p>
              <p className="mt-1">
                You&rsquo;ll see every deal you&rsquo;re assigned to as the
                attorney, with key dates, contract status, and the closing
                clock. You can message the realtor and other parties without
                seeing the buyer/seller&rsquo;s private discussions.
              </p>
            </div>
            <button type="submit" className="btn-primary mt-2 w-full">
              Open my dashboard &rarr;
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
