import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-static';

/**
 * Android App Links manifest - counterpart to apple-app-site-association.
 * Lets https://realtorportal.parallelstudios.co/welcome and /invite open the
 * Android app directly when installed.
 *
 * Required values:
 *   ANDROID_PACKAGE_NAME - e.g. com.parallelstudios.realtorportal
 *   ANDROID_SHA256_FINGERPRINT - get from `eas credentials -p android`
 *
 * Until ANDROID_SHA256_FINGERPRINT is set, the file is harmless (no app
 * link verification will succeed).
 */
export async function GET() {
  const packageName =
    process.env.ANDROID_PACKAGE_NAME || 'com.parallelstudios.realtorportal';
  const sha256 = process.env.ANDROID_SHA256_FINGERPRINT || '';

  const body = [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: sha256 ? [sha256] : [],
      },
    },
  ];

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
