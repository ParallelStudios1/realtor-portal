import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { NetSheetCalculator, type Prefill } from './NetSheetCalculator';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seller net sheet · Realtor Portal' };

/**
 * Staff-facing seller NET SHEET + OFFER COMPARISON calculator.
 *
 * All math is client-side (see NetSheetCalculator). This server component only
 * gates access and - optionally - prefills the calculator from a deal when
 * `?searchId=<id>` is supplied. The calculator works with zero query params,
 * so the prefill path is strictly additive.
 */
export default async function NetSheetPage({
  searchParams,
}: {
  searchParams: { searchId?: string };
}) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!me.firm_id) redirect('/onboarding');

  const role = me.role || '';
  const isStaff =
    role === 'owner' ||
    role === 'firm_admin' ||
    role === 'manager' ||
    role === 'super_admin' ||
    role === 'realtor' ||
    role === 'agent';
  if (!isStaff) redirect('/dashboard');

  // --- Optional prefill --------------------------------------------------
  // Pull agreed_price + commission_pct off the deal IF a searchId is given AND
  // the deal belongs to the caller's firm. Anything missing just falls through
  // to the calculator's own defaults - never a hard error for the user.
  let prefill: Prefill | null = null;
  const searchId = searchParams.searchId?.trim();
  if (searchId) {
    try {
      const service = getSupabaseServiceRoleClient();
      const { data: deal } = await service
        .from('client_searches')
        .select('id, firm_id, name, agreed_price, closing_amount, commission_pct')
        .eq('id', searchId)
        .maybeSingle();
      // Firm-scope the prefill - never leak another firm's numbers.
      if (deal && (deal as { firm_id: string | null }).firm_id === me.firm_id) {
        const d = deal as {
          id: string;
          name: string | null;
          agreed_price: number | null;
          closing_amount: number | null;
          commission_pct: number | null;
        };
        const price =
          d.agreed_price != null
            ? Number(d.agreed_price)
            : d.closing_amount != null
            ? Number(d.closing_amount)
            : null;
        prefill = {
          searchId: d.id,
          dealName: d.name,
          salePrice: price != null && Number.isFinite(price) ? price : null,
          commissionPct:
            d.commission_pct != null && Number.isFinite(Number(d.commission_pct))
              ? Number(d.commission_pct)
              : null,
        };
      }
    } catch {
      // Prefill is best-effort. Swallow and render the blank calculator.
      prefill = null;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-ink-500 transition hover:text-ink-900"
        >
          ← Dashboard
        </Link>
        <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
          Tools
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink-900">
          Seller net sheet
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Estimate seller proceeds and compare offers side by side. Figures are
          estimates for discussion - not a closing statement.
        </p>
      </header>

      <NetSheetCalculator prefill={prefill} />
    </main>
  );
}
