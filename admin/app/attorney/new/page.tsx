import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { createAttorneyDealAction } from './actions';
import { NewDealForm } from './NewDealForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Start a deal · Attorney' };

/**
 * Attorney-led deal creation form.
 *
 * Only attorneys whose account belongs to their own practice (law_firm) get
 * the form; attorneys attached to a brokerage see an explanation instead of a
 * silent failure, because THEIR deals belong to the brokerage's realtors.
 */
export default async function AttorneyNewDealPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const me = await getMe();
  if (!me?.user_id) redirect('/login?next=/attorney/new');
  if (me.role !== 'attorney') redirect('/attorney');

  const service = getSupabaseServiceRoleClient();
  const { data: firm } = await service
    .from('firms')
    .select('id, name, firm_type')
    .eq('id', me.firm_id || '')
    .maybeSingle();
  const isLawFirm = (firm as any)?.firm_type === 'law_firm';

  return (
    <main className="min-h-screen bg-ink-50 py-10">
      <div className="mx-auto max-w-2xl px-6">
        <Link
          href="/attorney"
          className="mb-6 inline-flex items-center gap-1 text-sm text-ink-600 transition hover:text-ink-900"
        >
          <span aria-hidden>←</span> Back to your deals
        </Link>

        <div className="rounded-2xl border border-ink-200 bg-white p-8 shadow-soft-lg">
          <h1 className="text-2xl font-bold tracking-tight">Start a deal</h1>

          {!isLawFirm ? (
            <div className="mt-4 space-y-3 text-sm text-ink-700">
              <p>
                Your account is attached to{' '}
                <strong>{(firm as any)?.name || 'a brokerage'}</strong>, so
                deals there are started by its realtors and you're added to
                each one.
              </p>
              <p>
                Want to orchestrate your own deals? Create your practice — it
                takes a minute and your existing deals stay right where they
                are.
              </p>
              <Link href="/signup?role=attorney" className="btn-primary mt-2">
                Set up my practice →
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-600">
                You quarterback this deal from {(firm as any)?.name}. Everyone
                you add below gets an email invite and their own view of the
                deal — realtors and clients never pay to join.
              </p>

              {searchParams.error && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  {searchParams.error}
                </div>
              )}

              <NewDealForm action={createAttorneyDealAction} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
