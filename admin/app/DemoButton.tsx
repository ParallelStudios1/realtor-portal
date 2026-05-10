'use client';

import { useState } from 'react';

/**
 * "Try the demo" CTA. Hits /api/demo/start, gets back a magic-link URL for
 * the seeded demo realtor, and bounces the browser there. The user lands
 * inside the dashboard already authenticated.
 */
export function DemoButton({
  role = 'realtor',
  className,
  children,
}: {
  role?: 'realtor' | 'buyer' | 'seller';
  className?: string;
  children?: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        setError(json.error || 'Could not start the demo.');
        setLoading(false);
        return;
      }
      window.location.href = json.url;
    } catch (e: any) {
      setError(e?.message || 'Could not start the demo.');
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className={
          className ??
          'rounded-md border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60'
        }
      >
        {loading ? 'Starting demo…' : (children ?? 'Try the demo')}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export default DemoButton;
