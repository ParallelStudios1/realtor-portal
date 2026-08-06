'use client';

import { useEffect, useState } from 'react';

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
    if (dismissedRecently()) return;

    if (isIosSafari && !gracePeriodElapsed()) {
      // Apple's banner is presumably still showing on this visit. Stand down.
      return;
    }
    setPlatform(p);
  }, []);

  if (!platform) return null;

  const href = platform === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  const storeName = platform === 'ios' ? 'App Store' : 'Google Play';

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setPlatform(null);
  };

  /**
   * Navigate in the CURRENT tab rather than opening a new one.
   *
   * In-app browsers (Instagram, Facebook, TikTok, LinkedIn) have no tabs, so a
   * target="_blank" link is silently swallowed and the button appears dead.
   * That matters here because Instagram ads are a real traffic source. On a
   * phone a same-tab store link is also just better: iOS and Android hand the
   * URL straight to the App Store / Play Store app, so the user never loses
   * their place.
   */
  const openStore = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.location.href = href;
  };

  return (
    <div
      role="complementary"
      aria-label="Get the Realtor Portal mobile app"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt=""
          aria-hidden
          className="h-11 w-11 shrink-0 rounded-xl object-contain"
        />

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-900">Realtor Portal</div>
          <div className="truncate text-xs text-ink-600">
            Deadlines and documents in your pocket
          </div>
        </div>

        <a
          href={href}
          onClick={openStore}
          className="shrink-0 rounded-lg bg-ink-900 px-3.5 py-2 text-sm font-semibold text-white active:scale-[0.98]"
        >
          Get
        </a>

        <button
          type="button"
          onClick={dismiss}
          aria-label={`Dismiss ${storeName} banner`}
          className="-mr-1 shrink-0 p-2 text-ink-400"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
