'use client';

import { useEffect, useState } from 'react';
import { track } from '@vercel/analytics';

/**
 * Mobile-only "get the app" banner.
 *
 * Shows a single store link matched to the visitor's phone, because sending an
 * iPhone user to Google Play (or the reverse) is pure friction. iPad and every
 * desktop browser see nothing — the web app is the better experience there.
 *
 * Dismissal is remembered so a returning visitor isn't nagged. We use
 * localStorage rather than a cookie to keep it off every server request.
 *
 * This renders on every phone, iOS Safari included. Apple's native Smart App
 * Banner would be nicer there (it can say "Open" when the app is installed),
 * but it only appears once the app is actually live on the App Store. Deferring
 * to it meant iPhone visitors saw no banner at all while the app was still in
 * review. Showing our own everywhere is the behaviour that always works.
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/realtor-portal/id6768115138';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.parallelstudios.realtorportal';

const DISMISS_KEY = 'rp_app_banner_dismissed_at';
const FIRST_SEEN_KEY = 'rp_app_banner_first_seen_at';
/** Re-offer after this long, so one dismissal isn't forever. */
const DISMISS_DAYS = 30;
/**
 * On iOS Safari, Apple's own Smart App Banner gets the first crack. We hold
 * ours back this long so the two don't fight, then take over — which is what
 * makes the prompt recoverable. Safari remembers a dismissal of its banner
 * forever and gives no way to bring it back or even detect it, so without this
 * an iPhone user who swipes it away once would never be offered the app again.
 */
const IOS_SAFARI_GRACE_HOURS = 24;

type Platform = 'ios' | 'android' | null;

/**
 * Which phone is this? Deliberately conservative: anything we can't identify
 * as a phone returns null and shows nothing.
 */
function detectPhone(): { platform: Platform; isIosSafari: boolean } {
  if (typeof navigator === 'undefined') return { platform: null, isIosSafari: false };
  const ua = navigator.userAgent || '';

  // iPadOS 13+ reports itself as a Mac, so a touch-capable "Mac" is an iPad.
  // We only target phones, so both plain Macs and iPads fall through to null.
  const isIpad =
    /iPad/.test(ua) ||
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1);
  if (isIpad) return { platform: null, isIosSafari: false };

  const isIphone = /iPhone|iPod/.test(ua);
  const isAndroidPhone = /Android/.test(ua) && /Mobile/.test(ua);

  // Only real Safari renders Apple's Smart App Banner. Third-party browsers
  // and every in-app webview (Instagram and Facebook ads are real traffic for
  // us) do not — so they must NOT be held back by the grace period, or those
  // visitors would see no banner at all.
  const isIosSafari =
    isIphone &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|FBIOS|LinkedInApp|Twitter|Snapchat|Pinterest|BytedanceWebview|musical_ly|TikTok|WebView|GSA/i.test(
      ua
    );

  return {
    platform: isIphone ? 'ios' : isAndroidPhone ? 'android' : null,
    isIosSafari,
  };
}

/**
 * True once enough time has passed since this visitor's first page view for us
 * to assume Apple's banner has had its turn (and, if they dismissed it, is
 * never coming back). Stamps the clock on the first call.
 */
function gracePeriodElapsed(): boolean {
  try {
    const raw = window.localStorage.getItem(FIRST_SEEN_KEY);
    if (!raw) {
      window.localStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
      return false;
    }
    const first = Number(raw);
    if (!Number.isFinite(first)) return true;
    return Date.now() - first >= IOS_SAFARI_GRACE_HOURS * 60 * 60 * 1000;
  } catch {
    // Storage blocked: we can't track the grace period, and showing nothing
    // would be worse than a possible double banner.
    return true;
  }
}

function dismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    // Private mode / storage blocked → just show it.
    return false;
  }
}

export function GetTheAppBanner() {
  // Start hidden. Detection needs the browser, and rendering on the server
  // would flash the banner on desktop before hydration corrects it.
  const [platform, setPlatform] = useState<Platform>(null);

  useEffect(() => {
    const { platform: p, isIosSafari } = detectPhone();
    if (!p) return;

    // Test escape hatches, so checking this on a real phone doesn't mean
    // digging through browser settings to clear site data every time:
    //   ?appbanner=reset  forget the dismissal and the grace-period clock
    //   ?appbanner=1      show it now regardless of either
    const override = new URLSearchParams(window.location.search).get('appbanner');
    if (override === 'reset') {
      try {
        window.localStorage.removeItem(DISMISS_KEY);
        window.localStorage.removeItem(FIRST_SEEN_KEY);
      } catch {}
    }
    if (override === '1' || override === 'reset') {
      setPlatform(p);
      return;
    }

    if (dismissedRecently()) return;

    if (isIosSafari && !gracePeriodElapsed()) {
      // Apple's banner is presumably still showing on this visit. Stand down.
      return;
    }
    setPlatform(p);
  }, []);

  if (!platform) return null;

  // Only used for the dismiss label now; the CTA points at /get, which picks
  // the store server-side.
  const storeName = platform === 'ios' ? 'App Store' : 'Google Play';

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setPlatform(null);
  };

  /**
   * Deliberately a plain link to /get, with no JavaScript at all.
   *
   * Earlier versions intercepted the click and drove window.location, first to
   * the store URL and then to itms-apps://. Both kept doing nothing inside
   * Instagram's webview, which blocks custom schemes and can ignore
   * script-driven navigation. A plain anchor to a same-origin URL is the one
   * thing every webview reliably follows, and /get answers with a server-side
   * 302 to the correct store before any of our code runs.
   */

  return (
    <>
      {/*
        Scoped so the component stays self-contained rather than leaking
        keyframes into globals.css. The slide-up is what makes the banner
        register as an arrival instead of page furniture people scroll past.
        Respects prefers-reduced-motion.
      */}
      <style>{`
        @keyframes rpBannerUp {
          from { transform: translateY(120%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .rp-banner { animation: rpBannerUp .42s cubic-bezier(.16,1,.3,1) .35s both; }
        @media (prefers-reduced-motion: reduce) {
          .rp-banner { animation: none; }
        }
      `}</style>

      <div
        role="complementary"
        aria-label="Download the Realtor Portal app"
        className="rp-banner fixed inset-x-0 bottom-0 z-50 px-3 pt-3 md:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              aria-hidden
              className="h-14 w-14 shrink-0 rounded-2xl border border-ink-100 object-contain shadow-sm"
            />

            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold leading-tight text-ink-900">
                Get the Realtor Portal app
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-ink-600">
                Your deals, deadlines and documents, wherever you are.
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                Free · {platform === 'ios' ? 'iPhone & iPad' : 'Android'}
              </div>
            </div>

            <button
              type="button"
              onClick={dismiss}
              aria-label={`Dismiss ${storeName} banner`}
              className="-mr-1 -mt-1 shrink-0 self-start p-2 text-ink-300 active:text-ink-500"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Full-width CTA: the whole point is that this is unmissable. */}
          <a
            href="/get"
            onClick={() => track('get_app_clicked', { platform: platform || '' })}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-3.5 text-[15px] font-bold text-white shadow-sm transition active:scale-[0.985]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Download App
          </a>
        </div>
      </div>
    </>
  );
}
