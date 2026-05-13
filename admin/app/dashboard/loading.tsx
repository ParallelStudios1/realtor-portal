export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 h-9 w-64 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>
      <div className="mt-10 h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </main>
  );
}
