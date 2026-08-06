import { NextResponse } from 'next/server';

/**
 * /get — one link that lands the visitor on the right app store.
 *
 * Point ads, QR codes, email footers and link-in-bio at this. Detection happens
 * on the SERVER from the User-Agent header and answers with an HTTP redirect,
 * which is the whole point: in-app browsers (Instagram, Facebook, TikTok) are
 * hostile to client-side navigation. They swallow target="_blank", frequently
 * block custom schemes like itms-apps://, and can ignore JS-driven location
 * changes — which is exactly why a tappable button kept doing nothing there.
 *
 * A 302 has none of those problems. Every browser and every webview follows it
 * before a line of our JavaScript runs.
 *
 * Desktop visitors fall through to the marketing site, since sending someone on
 * a laptop to an App Store page is a dead end.
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/realtor-portal/id6768115138';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.parallelstudios.realtorportal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);

  // ?platform=ios|android forces a destination, for testing and for cases
  // where you want an explicitly-iOS or explicitly-Android ad creative.
  const forced = (url.searchParams.get('platform') || '').toLowerCase();

  const isIos = forced === 'ios' || /iPhone|iPad|iPod/i.test(ua);
  // iPadOS 13+ masquerades as a Mac. There's no Client Hints signal in a bare
  // GET, so a "Macintosh" that also claims mobile is treated as iPadOS.
  const isIpadOs = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  const isAndroid = forced === 'android' || /Android/i.test(ua);

  if (isIos || isIpadOs) {
    return NextResponse.redirect(APP_STORE_URL, 302);
  }
  if (isAndroid) {
    return NextResponse.redirect(PLAY_STORE_URL, 302);
  }

  // Desktop, bots, anything unrecognised: the website is the useful answer.
  return NextResponse.redirect(new URL('/', url.origin), 302);
}
