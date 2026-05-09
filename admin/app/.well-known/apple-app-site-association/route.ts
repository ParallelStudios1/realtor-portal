import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-static';

/**
 * Apple App Site Association (AASA) — required for Universal Links so that
 * https://realtor-portal-ten.vercel.app/welcome and /invite open the iOS app
 * directly when installed (instead of bouncing through Safari).
 *
 * The appID is "<APPLE_TEAM_ID>.<BUNDLE_IDENTIFIER>". The Apple Team ID is
 * available at https://developer.apple.com/account → Membership.
 *
 * Set APPLE_TEAM_ID in Vercel env vars. We default to a placeholder that
 * still lets the file resolve (Apple will silently ignore until you set the
 * real value), so deploys never break.
 *
 * Apple requires this file to be served at:
 *   https://<your-domain>/.well-known/apple-app-site-association
 * with Content-Type application/json (no .json extension).
 */
export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID || 'TEAMIDXXXX';
  const bundleId = 'com.parallelstudios.realtorportal';
  const appID = `${teamId}.${bundleId}`;

  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          // Routes that should open the app when tapped from a link in
          // Mail / Messages / Safari. Anything else stays on the web.
          paths: ['/welcome', '/welcome/*', '/invite', '/invite/*'],
        },
      ],
    },
    // (Optional) webcredentials enables iCloud Keychain shared logins
    webcredentials: {
      apps: [appID],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
