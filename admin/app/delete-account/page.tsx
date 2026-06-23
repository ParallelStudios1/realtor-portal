'use client';

import { useState } from 'react';

export default function DeleteAccountPage() {
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/account/delete-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, details }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Something went wrong.');
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-2 flex items-center gap-2">
        <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg" />
        <span className="text-sm font-bold tracking-tight">Realtor Portal</span>
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-ink-900">
        Delete your account &amp; data
      </h1>
      <p className="mt-3 text-ink-700">
        You can permanently delete your Realtor Portal account and your personal
        data at any time. There are two ways to do it:
      </p>

      <div className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-sm">
        <h2 className="text-lg font-semibold text-ink-900">In the app (fastest)</h2>
        <p className="mt-1 text-sm text-ink-600">
          Open Realtor Portal, go to <strong>Settings</strong>, and tap{' '}
          <strong>Delete my account</strong>. Your account and personal data are
          removed immediately.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-sm">
        <h2 className="text-lg font-semibold text-ink-900">Request it here</h2>
        <p className="mt-1 text-sm text-ink-600">
          Prefer us to handle it? Enter the email on your account and we'll
          delete the account and associated data, then confirm by email. We
          process requests within 30 days (usually much sooner).
        </p>

        {done ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Request received. We'll delete your account and email you a
            confirmation.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink-800">Email on your account</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink-900/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-800">
                Anything else (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-ink-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink-900/10"
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Request account deletion'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-6 text-xs text-ink-500">
        What gets deleted: your profile, login, messages you sent, and personal
        records tied to your account. Shared transaction records that other
        parties rely on are retained only as long as legally required, with your
        personal identifiers removed. Questions?{' '}
        <a href="mailto:turnerlogan@parallelstudios.co" className="underline">
          turnerlogan@parallelstudios.co
        </a>
        .
      </p>
    </main>
  );
}
