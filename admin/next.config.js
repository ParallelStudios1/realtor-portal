/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow Supabase Storage logos to render in <Image> if you adopt next/image
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
};

// Wrap with Sentry only when @sentry/nextjs is installed AND a DSN is configured.
// This way the build doesn't fail if Sentry isn't set up yet.
let exported = nextConfig;
try {
  if (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) {
    const { withSentryConfig } = require('@sentry/nextjs');
    exported = withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    });
  }
} catch {
  // @sentry/nextjs not installed yet — that's fine, run `npm install @sentry/nextjs`
}

module.exports = exported;
