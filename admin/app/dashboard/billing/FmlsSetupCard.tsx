'use client';

import { useState } from 'react';

/**
 * The integrated "finish FMLS setup" flow — shown right after the add-on
 * activates, until the firm confirms FMLS's one required step. The autofill
 * already works; this is FMLS's member-registration paper trail, done from
 * inside the app instead of via email.
 */
export function FmlsSetupCard() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const markDone = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/fmls/marketplace-done', { method: 'POST' });
      if (r.ok) setDone(true);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        FMLS setup complete — you&apos;re fully registered. Happy autofilling.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="text-sm font-bold text-ink-900">
        One FMLS step to finish your setup
      </h3>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-700">
        Your FMLS autofill is already working. FMLS separately requires each
        member firm to register its subscription to Realtor Portal in their
        Marketplace — a one-time, two-minute step on FMLS&apos;s site with
        your FMLS account.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href="https://marketplace.fmls.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary text-sm"
        >
          Open FMLS Marketplace → subscribe to “Realtor Portal”
        </a>
        <button
          onClick={markDone}
          disabled={busy}
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-900 hover:text-ink-900 disabled:opacity-50"
        >
          {busy ? 'Saving…' : "I've subscribed — mark done"}
        </button>
      </div>
    </div>
  );
}
