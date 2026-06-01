export default function ClientLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="h-8 w-48 animate-pulse rounded bg-ink-200" />
      <div className="mt-6 h-32 animate-pulse rounded-xl bg-ink-100" />
      <div className="mt-4 h-40 animate-pulse rounded-xl bg-ink-100" />
    </main>
  );
}
