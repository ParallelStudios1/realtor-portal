import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-static';

/**
 * Apple App Site Association (AASA) for Universal Links.
 *
 * IMPORTANT: We do NOT capture /welcome here. The Supabase invite email lands
 * on /welcome with a URL fragment containing the access_token (e.g.
 * #access_token=...). iOS strips fragments before delivering Universal Link
 * URLs to the app, so capturing /welcome would break the password-set flow
 * (the app would open with no session → "no account").
 *
 * Instead, /welcome stays in Safari, the user sets their password, and the
 * welcome page deep-links into the app via the realtorportal:// custom scheme.
 *
 * /invite/* IS captured because that flow uses query params (not fragments)
 * and is safe to hand off to the app.
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
          paths: ['/invite', '/invite/*'],
        },
      ],
    },
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
