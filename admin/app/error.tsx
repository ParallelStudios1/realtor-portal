'use client';

/**
 * Next 14 root error boundary. Renders whenever a route throws or its data
 * fetching errors. We show a friendly retry UI in the brand color rather
 * than the default white-screen-of-death.
 *
 * `reset()` re-runs the failed segment without a full reload — keeps form
 * state and avoids logging the user out on transient API blips.
 */

import { useEffect } from 'react';

/**
 * True when the error is a stale-chunk / dynamic-import failure — i.e. the
 * browser is running an old build and tried to fetch a JS chunk that the new
 * deploy no longer serves. `reset()` can't fix this (it re-runs the segment
 * with the same dead webpack runtime), so the only cure is a full reload that
 * pulls the new build manifest. This is the classic "I deployed and open tabs
 * broke; Try again does nothing" footgun.
 */
function isChunkLoadError(error: Error & { name?: string }): boolean {
  const msg = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  return (
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes("'text/html' is not a valid javascript mime type")
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError =
    typeof window !== 'undefined' && isChunkLoadError(error);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // Surface the original error in dev so it doesn't get swallowed.
      console.error('[error.tsx]', error);
    }
    // Auto-recover from a stale-build chunk error with a single hard reload.
    // Guarded by sessionStorage so a genuinely broken chunk can't loop.
    if (chunkError) {
      try {
        const KEY = '__rp_chunk_reload__';
        const last = Number(sessionStorage.getItem(KEY) || '0');
        if (Date.now() - last > 10_000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }, [error, chunkError]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-soft-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 ring-1 ring-ink-200">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-7 w-7 text-ink-700"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-semibold text-slate-900">
          {chunkError ? 'Updating to the latest version…' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {chunkError
            ? 'A new version just shipped. Refreshing to load it — this only takes a second.'
            : "We hit a snag loading this page. It's almost always a quick blip."}
        </p>
        {error?.digest && (
          <p className="mt-3 text-xs text-slate-400">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              // reset() can't fix a stale-chunk error — force a full reload.
              if (chunkError && typeof window !== 'undefined') {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-soft-sm transition hover:bg-ink-700"
          >
            {chunkError ? 'Reload now' : 'Try again'}
          </button>
          {/* /login role-routes signed-in users to their own home
              (client → /client, attorney → /attorney, staff → /dashboard). */}
          <a
            href="/login"
            className="rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-400"
          >
            Go to my home screen
          </a>
        </div>
      </div>
    </main>
  );
}
