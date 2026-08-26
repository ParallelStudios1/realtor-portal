'use client';

import { useEffect } from 'react';
import { track } from '@vercel/analytics';

/**
 * Funnel instrumentation for the ad landing. Three events tell us exactly
 * where people fall out:
 *   start_view        - a human actually reached the page
 *   start_signup_done - they created an account
 *   start_store_click - they tapped through to the store
 * Instagram's "link clicks" number can no longer hide what really happened.
 */
export function StartAnalytics({ step }: { step: 'view' | 'done' }) {
  useEffect(() => {
    track(step === 'done' ? 'start_signup_done' : 'start_view');
  }, [step]);
  return null;
}

/**
 * Plain anchor to /get (any JS-driven navigation dies in Instagram's
 * webview; a same-origin <a> with a server-side 302 is the one reliable
 * path). The click handler only records the event - it never preventDefaults.
 */
export function TrackedStoreLink() {
  return (
    <a
      href="/get"
      onClick={() => {
        try {
          track('start_store_click');
        } catch {}
      }}
      className="btn-primary mt-8 w-full py-4 text-center text-base"
    >
      Download the app
    </a>
  );
}
