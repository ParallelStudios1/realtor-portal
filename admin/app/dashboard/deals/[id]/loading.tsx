/**
 * Deal workspace skeleton. Matches the real layout: hero card + action
 * grid + body grid (houses, activity) + right sidebar (financials, dates,
 * people). Same vertical rhythm so there's no shift when content arrives.
 */
export default function DealWorkspaceLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 h-4 w-72 animate-pulse rounded bg-ink-200" />
      <div className="h-48 animate-pulse rounded-2xl border border-ink-200 bg-white" />
      <div className="mt-6 h-56 animate-pulse rounded-2xl border border-ink-200 bg-white" />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-ink-200 bg-white"
            />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
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
