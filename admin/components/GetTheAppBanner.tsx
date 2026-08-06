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
 * Note: iOS Safari also gets Apple's native Smart App Banner via the
 * apple-itunes-app meta tag in layout.tsx. That one is nicer, knows whether the
 * app is already installed, and Safari draws it above the page. To avoid
 * stacking two banners we suppress this one on Safari/iOS and let Apple's win.
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/realtor-portal/id6768115138';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.parallelstudios.realtorportal';

const DISMISS_KEY = 'rp_app_banner_dismissed_at';
/** Re-offer after this long, so one dismissal isn't forever. */
const DISMISS_DAYS = 30;

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

  // Chrome/Firefox/Edge on iOS all embed "CriOS"/"FxiOS"/"EdgiOS"; real Safari
  // has none of those. Only real Safari renders Apple's Smart App Banner.
  const isIosSafari =
    isIphone && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV/.test(ua);

  return {
    platform: isIphone ? 'ios' : isAndroidPhone ? 'android' : null,
    isIosSafari,
  };
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
    if (isIosSafari) return; // Apple's own banner handles this case.
    if (dismissedRecently()) return;
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

  return (
    <div
      role="complementary"
      aria-label="Get the Realtor Portal mobile app"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-900">
          <span className="text-base font-bold text-white">RP</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink-900">Realtor Portal</div>
          <div className="truncate text-xs text-ink-600">
            Deadlines and documents in your pocket
          </div>
        </div>

        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
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
