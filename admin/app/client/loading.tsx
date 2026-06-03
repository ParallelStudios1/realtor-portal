export default function ClientLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton mt-3 h-8 w-48 rounded-lg" />
      <div className="skeleton mt-8 h-36 rounded-2xl" />
      <div className="skeleton mt-4 h-24 rounded-2xl" />
      <div className="skeleton mt-4 h-40 rounded-2xl" />
    </main>
  );
}
