export const metadata = { title: 'Privacy Policy · Realtor Portal' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: May 2026</p>

      <div className="prose prose-slate mt-8 space-y-4 text-sm text-slate-700">
        <p>
          Realtor Portal is operated by Parallel Studios. We collect only the information
          necessary to provide a client portal experience for real estate transactions:
          name, email, phone, transaction details, documents you upload, and basic usage
          analytics.
        </p>
        <p>
          <strong>We do not sell your data.</strong> We do not share data between firms.
          Each firm is an isolated tenant — their clients' data is invisible to other firms.
        </p>
        <p>
          You can request a full export or deletion of your data at any time by emailing{' '}
          <a href="mailto:turnerlogan@parallelstudios.co" className="text-blue-600 underline">
            turnerlogan@parallelstudios.co
          </a>
          .
        </p>
        <p>
          For full terms, see <a href="/terms" className="text-blue-600 underline">our Terms</a>.
        </p>
      </div>
    </main>
  );
}
