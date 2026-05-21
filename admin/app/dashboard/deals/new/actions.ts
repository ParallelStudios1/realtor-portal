'use server';

import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { isFirmPlanActive } from '@/lib/planGate';

/**
 * Start a deal without picking a client first.
 *
 * Realtors often start tracking a deal before they know who the principal
 * client is — open house leads, listing-side conversations with a couple
 * who hasn't decided whose name goes on it yet, dual-realtor handoffs.
 * Forcing them to invite a client first was creating fake-name "John
 * Smith" placeholders that cluttered the Clients menu.
 *
 * After this action runs, the realtor lands on the new deal workspace
 * where Add Party covers every scenario: pick from past clients, invite a
 * brand-new client, or attach a non-client party (co-realtor, attorney,
 * lender, etc.).
 */
export async function createBlankDealAction(payload: {
  name: string;
  kind?: 'buyer' | 'seller' | 'both' | null;
}) {
  const me = await getMe();
  if (!me?.firm_id) {
    redirect(
      '/dashboard/deals/new?error=' + encodeURIComponent('Not signed in.')
    );
  }
  if (me!.role !== 'realtor' &&
      me!.role !== 'firm_admin' &&
      me!.role !== 'super_admin' &&
      me!.role !== 'owner' &&
      me!.role !== 'manager') {
    redirect(
      '/dashboard/deals/new?error=' +
        encodeURIComponent('Only realtors can start a deal.')
    );
  }
  const planOk = await isFirmPlanActive(me!.firm_id);
  if (!planOk) {
    redirect(
      '/dashboard/deals/new?error=' +
        encodeURIComponent(
          'Your free trial has ended. Pick a plan in Settings → Billing.'
        )
    );
  }

  const name = (payload.name || '').trim();
  if (!name) {
    redirect(
      '/dashboard/deals/new?error=' +
        encodeURIComponent('Deal name is required.')
    );
  }

  const service = getSupabaseServiceRoleClient();
  // kind defaults to 'buyer' so downstream UI doesn't have to handle null
  // — most cases are buyer-side anyway. The realtor can change it later
  // from the deal workspace.
  const kind = payload.kind === 'seller' ? 'seller' : 'buyer';
  const { data: created, error } = await service
    .from('client_searches')
    .insert({
      firm_id: me!.firm_id,
      client_id: null, // explicitly blank — populated when a party is added
      realtor_id: me!.user_id,
      name,
      phase: 'searching',
      kind,
    })
    .select('id')
    .single();
  if (error) {
    redirect(
      '/dashboard/deals/new?error=' +
        encodeURIComponent('Could not start deal: ' + error.message)
    );
  }
  redirect('/dashboard/deals/' + (created as any).id + '?fresh=1');
}
