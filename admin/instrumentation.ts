/**
 * Next.js instrumentation hook - loads the Sentry server/edge configs when
 * the app boots. Both configs no-op unless SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN
 * is set, so this is safe with Sentry unconfigured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
