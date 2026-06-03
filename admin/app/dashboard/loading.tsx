/**
 * Dashboard-wide loading state. Renders the moment any /dashboard/* page
 * starts fetching server data, replaced with the real page when it
 * resolves. Combined with the top-edge NavigationProgress bar this means
 * the screen never sits frozen after a click.
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-3 h-8 w-48 animate-pulse rounded bg-ink-200" />
      <div className="mb-8 h-4 w-64 animate-pulse rounded bg-ink-200" />

      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-ink-200 bg-white"
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl border border-ink-200 bg-white"
            />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-ink-200 bg-white"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
