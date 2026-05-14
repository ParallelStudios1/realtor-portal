import { notFound, redirect } from 'next/navigation';
import { getMe, getSupabaseServerClient } from '@/lib/supabaseSsr';

export const dynamic = 'force-dynamic';

/**
 * Legacy /dashboard/clients/[id] route — the daily realtor workspace.
 *
 * This used to be a 1000-line god-page. We've moved the canonical surface to
 * /dashboard/deals/[id] (per-deal, not per-client). To preserve every existing
 * bookmark, email link, and revalidatePath call from server actions, we keep
 * this route alive and 302 it to the client's most recent deal.
 *
 * Clients with multiple deals get the most recent; the deal page itself
 * surfaces a switcher in its breadcrumb row.
 */
export default async function LegacyClientDetailRedirect({
  params,
}: {
  params: { id: string };
}) {
  const me = (await getMe())!;
  const supabase = getSupabaseServerClient();

  // Confirm the client exists in this firm.
  const { data: client } = await supabase
    .from('users')
    .select('id')
    .eq('id', params.id)
    .eq('firm_id', me.firm_id!)
    .maybeSingle();
  if (!client) notFound();

  // Most recent deal for this client. If there's no deal, /dashboard/deals
  // shows the empty state with a "+ New deal" CTA.
  const { data: latest } = await supabase
    .from('client_searches')
    .select('id')
    .eq('client_id', params.id)
    .eq('firm_id', me.firm_id!)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) redirect('/dashboard/deals');
  redirect('/dashboard/deals/' + latest.id);
}
