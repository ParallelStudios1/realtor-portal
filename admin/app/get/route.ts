import { NextResponse } from 'next/server';

/**
 * /get — one link that lands the visitor on the right app store.
 *
 * Point ads, QR codes, email footers and link-in-bio at this.
 *
 * Two different responses, because in-app browsers are a different animal:
 *
 *   Normal browsers      → plain 302 to the store. Fast, no page flash.
 *   In-app webviews      → a real HTML page that offers the store link.
 *
 * Why the split. Instagram/Facebook/TikTok webviews are hostile to every
 * automatic path: they swallow target="_blank", block custom schemes like
 * itms-apps://, can ignore script-driven navigation, and — the failure we
 * actually hit — will sit spinning forever when handed a 302 straight to
 * apps.apple.com, because iOS wants to hand off to the App Store app and the
 * webview refuses to let go.
 *
 * A page can't hang. Worst case the visitor sees a branded screen with one
 * obvious button and instructions to open in their real browser, which always
 * works. Best case the meta refresh carries them straight through.
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/realtor-portal/id6768115138';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.parallelstudios.realtorportal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Webviews embedded in another app, where automatic navigation is unreliable. */
const IN_APP_BROWSER =
  /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|LinkedInApp|Twitter|Snapchat|Pinterest|BytedanceWebview|musical_ly|TikTok|Line\/|WhatsApp|WebView|; wv\)/i;

function storePage(storeUrl: string, storeName: string, isIos: boolean) {
  // Native scheme first: some webviews DO honour it, and it opens the store
  // app instantly. The visible button is the guaranteed path.
  const nativeUrl = isIos
    ? 'itms-apps://apps.apple.com/us/app/realtor-portal/id6768115138'
    : 'market://details?id=com.parallelstudios.realtorportal';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${storeUrl}">
<title>Get Realtor Portal</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
         background:#fff; color:#0F172A; display:flex; align-items:center; justify-content:center;
         min-height:100vh; padding:24px; text-align:center; }
  .card { max-width:340px; width:100%; }
  img { width:76px; height:76px; border-radius:18px; box-shadow:0 4px 16px rgba(0,0,0,.12); }
  h1 { font-size:21px; margin:20px 0 6px; }
  p { color:#475569; font-size:14px; line-height:1.5; margin:0 0 24px; }
  a.btn { display:block; background:#0F172A; color:#fff; text-decoration:none;
          padding:16px; border-radius:14px; font-weight:700; font-size:16px; }
  .hint { margin-top:18px; font-size:12.5px; color:#94A3B8; line-height:1.5; }
</style>
</head>
<body>
  <div class="card">
    <img src="/logo.png" alt="">
    <h1>Get Realtor Portal</h1>
    <p>Your deals, deadlines and documents, wherever you are.</p>
    <a class="btn" href="${storeUrl}">Open in the ${storeName}</a>
    <p class="hint">If the button doesn't open the ${storeName}, tap the
      &#8943; menu in the corner and choose <b>Open in browser</b>.</p>
  </div>
  <script>
    // Try the store app directly. Harmless where the scheme is blocked, and
    // the button above still works either way.
    try { window.location.replace(${JSON.stringify(nativeUrl)}); } catch (e) {}
    setTimeout(function () {
      try { window.location.replace(${JSON.stringify(storeUrl)}); } catch (e) {}
    }, 1200);
  </script>
</body>
</html>`;
}

export async function GET(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);

  // ?platform=ios|android forces a destination, for testing and for
  // platform-specific ad creative.
  const forced = (url.searchParams.get('platform') || '').toLowerCase();

  const isIos = forced === 'ios' || /iPhone|iPad|iPod/i.test(ua);
  // iPadOS 13+ masquerades as a Mac. No Client Hints on a bare GET, so a
  // "Macintosh" that also claims mobile is treated as iPadOS.
  const isIpadOs = /Macintosh/i.test(ua) && /Mobile/i.test(ua);
  const isAndroid = forced === 'android' || /Android/i.test(ua);
  const isMobile = isIos || isIpadOs || isAndroid;

  if (!isMobile) {
    // Desktop, bots, anything unrecognised: the website is the useful answer.
    return NextResponse.redirect(new URL('/', url.origin), 302);
  }

  const storeUrl = isIos || isIpadOs ? APP_STORE_URL : PLAY_STORE_URL;
  const storeName = isIos || isIpadOs ? 'App Store' : 'Play Store';

  // ?mode=page forces the interstitial so it can be tested from any browser.
  if (IN_APP_BROWSER.test(ua) || url.searchParams.get('mode') === 'page') {
    return new NextResponse(storePage(storeUrl, storeName, isIos || isIpadOs), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Never let a webview serve a stale copy of this.
        'cache-control': 'no-store, max-age=0',
      },
    });
  }

  return NextResponse.redirect(storeUrl, 302);
}
