export const metadata = { title: 'Terms of Service · Realtor Portal' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: May 2026</p>

      <div className="prose prose-slate mt-8 space-y-4 text-sm text-slate-700">
        <p>
          Realtor Portal is a software-as-a-service platform for real estate firms.
          By signing up, you agree to use the service in accordance with applicable
          laws and not to misuse the system.
        </p>
        <p>
          Subscriptions are billed monthly. You may cancel at any time; cancellations take
          effect at the end of the current billing period.
        </p>
        <p>
          We provide the service "as is" without warranty. Our maximum liability for any claim
          is limited to the amount you paid in the prior 12 months.
        </p>
        <p>
          Questions? Email{' '}
          <a href="mailto:turnerlogan@parallelstudios.co" className="text-blue-600 underline">
            turnerlogan@parallelstudios.co
          </a>
          .
        </p>
      </div>
    </main>
  );
}
