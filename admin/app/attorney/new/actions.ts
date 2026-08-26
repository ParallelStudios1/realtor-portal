'use server';

import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { isFirmPlanActive } from '@/lib/planGate';
import { defaultPartyPermissions } from '@/lib/partyPermissions';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

/**
 * Attorney-led deal creation.
 *
 * An attorney with their own practice (firms.firm_type='law_firm') creates a
 * deal under that firm and invites the parties: the client (buyer or seller),
 * the realtor(s), and anyone else. Invited parties never pay — same guest
 * model as cross-firm co-brokering.
 *
 * Deliberate differences from realtor deal creation:
 *   - realtor_id / client_id start NULL. The columns are nullable and every
 *     invited party attaches via deal_participants, which is what the
 *     universal /deal/[id] page renders from.
 *   - orchestrated_by='attorney' marks the deal so dashboards and access
 *     checks know who quarterbacks it.
 *   - The attorney is inserted as a deal_participants row with full
 *     visibility, which is exactly how the existing /attorney dashboard
 *     discovers deals — so the new deal appears there with zero extra code.
 *
 * Attorneys who belong to a BROKERAGE (invited by a realtor, the pre-existing
 * flow) are refused: creating a deal would drop it into the brokerage's
 * account and seat pool, which the brokerage never agreed to.
 */

type PartyInput = {
  role: string;
  name: string;
  email: string;
};

const INVITABLE_ROLES = new Set([
  'realtor',
  'co_realtor',
  'buyer',
  'seller',
  'lender',
  'inspector',
  'title_agent',
  'other',
]);

export async function createAttorneyDealAction(formData: FormData) {
  const me = await getMe();
  if (!me?.user_id) redirect('/login?next=/attorney/new');

  const back = (msg: string) =>
    redirect('/attorney/new?error=' + encodeURIComponent(msg));

  if (me.role !== 'attorney') back('Only attorneys can start attorney-led deals.');
  if (!me.firm_id)
    back('Your account has no practice attached. Contact support.');

  const service = getSupabaseServiceRoleClient();

  const { data: firm } = await service
    .from('firms')
    .select('id, name, firm_type')
    .eq('id', me.firm_id)
    .maybeSingle();

  if ((firm as any)?.firm_type !== 'law_firm') {
    back(
      'Your account is attached to a brokerage, so deals are started by its realtors. To orchestrate your own deals, sign up your practice from the signup page.'
    );
  }

  if (!(await isFirmPlanActive(me.firm_id))) {
    back('Your trial has ended. Pick a plan in Billing to start new deals.');
  }

  // ---- Parse inputs ----
  const name = ((formData.get('name') as string) || '').trim();
  const kind = ((formData.get('kind') as string) || 'buyer').trim();
  const phase = ((formData.get('phase') as string) || 'searching').trim();
  const address = ((formData.get('address') as string) || '').trim();
  const notes = ((formData.get('notes') as string) || '').trim();

  if (!name) back('Give the deal a name — the client or property works well.');
  if (!['buyer', 'seller'].includes(kind)) back('Pick which side you represent.');
  if (!['searching', 'under_contract', 'closing'].includes(phase))
    back('Pick a valid starting stage.');

  const parties: PartyInput[] = [];
  const pushParty = (role: string, rawName: string, rawEmail: string) => {
    const pname = rawName.trim();
    const email = rawEmail.trim().toLowerCase();
    if (!pname && !email) return; // section left blank — fine
    if (!INVITABLE_ROLES.has(role)) back(`"${role}" is not an invitable role.`);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      back(`Enter a valid email for the ${role.replace('_', ' ')}.`);
    // One row per email — the referring realtor typed twice shouldn't get
    // two participant rows and two invites.
    if (parties.some((p) => p.email === email)) return;
    parties.push({ role, name: pname, email });
  };

  // The realistic intake: the referring realtor (usually the attorney's
  // actual client) and THEIR client, the buyer or seller. Both optional —
  // some files arrive with no agent attached.
  pushParty(
    'realtor',
    (formData.get('realtor_name') as string) || '',
    (formData.get('realtor_email') as string) || ''
  );
  pushParty(
    kind === 'seller' ? 'seller' : 'buyer',
    (formData.get('principal_name') as string) || '',
    (formData.get('principal_email') as string) || ''
  );

  // Extra rows arrive as parallel arrays party_role[]/party_name[]/party_email[]
  const roles = formData.getAll('party_role').map(String);
  const names = formData.getAll('party_name').map(String);
  const emails = formData.getAll('party_email').map(String);
  for (let i = 0; i < roles.length; i++) {
    const role = (roles[i] || '').trim();
    if (!role && !(names[i] || '').trim() && !(emails[i] || '').trim()) continue;
    pushParty(role, names[i] || '', emails[i] || '');
  }

  // ---- Create the deal ----
  const { data: deal, error: dealErr } = await service
    .from('client_searches')
    .insert({
      firm_id: me.firm_id,
      name,
      kind,
      phase,
      orchestrated_by: 'attorney',
      created_by: me.user_id,
      notes: notes || null,
      attorney_name: me.full_name || null,
      attorney_email: (me.email || '').toLowerCase() || null,
    })
    .select('id')
    .single();
  if (dealErr || !deal) {
    back('Could not create the deal: ' + (dealErr?.message || 'no row'));
    return;
  }
  const dealId = (deal as any).id as string;

  // The property, when provided. house status 'interested' is the neutral
  // starting state; sellers' listing mechanics can be layered on later from
  // the deal page.
  if (address) {
    await service.from('houses').insert({
      firm_id: me.firm_id,
      search_id: dealId,
      address,
    });
  }

  // The attorney themself — full visibility. This row is ALSO what makes the
  // deal show up on the /attorney dashboard.
  await service.from('deal_participants').insert({
    search_id: dealId,
    firm_id: me.firm_id,
    user_id: me.user_id,
    external_email: (me.email || '').toLowerCase() || null,
    external_name: me.full_name || null,
    role: 'attorney',
    can_view_documents: true,
    can_view_financials: true,
    can_view_messages: true,
    can_view_dates: true,
    created_by: me.user_id,
  });

  await service.from('activities').insert({
    firm_id: me.firm_id,
    search_id: dealId,
    actor_id: me.user_id,
    action: 'deal_created',
    target: name,
    metadata: { orchestrated_by: 'attorney' },
  });

  // ---- Invite the parties ----
  const siteUrl =
    process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
  const attorneyName = me.full_name || me.email || 'Your attorney';
  const firmName = (firm as any)?.name || 'a law practice';

  for (const p of parties) {
    // Link to an existing account when the email matches one.
    const { data: existingUser } = await service
      .from('users')
      .select('id')
      .ilike('email', p.email)
      .maybeSingle();

    const perms = defaultPartyPermissions(p.role);
    const { data: participant, error: partErr } = await service
      .from('deal_participants')
      .insert({
        search_id: dealId,
        firm_id: me.firm_id,
        user_id: (existingUser as any)?.id ?? null,
        external_email: p.email,
        external_name: p.name || null,
        role: p.role,
        can_view_documents: perms.can_view_documents,
        can_view_financials: perms.can_view_financials,
        can_view_messages: perms.can_view_messages,
        can_view_dates: perms.can_view_dates,
        created_by: me.user_id,
      })
      .select('id')
      .single();
    if (partErr) {
      console.error('[attorney/new] participant insert failed', partErr.message);
      continue; // deal exists; a failed invite must not kill the rest
    }

    // Branded invite token → /invite/<token> landing (same first-class flow
    // realtor invites use).
    let inviteUrl = siteUrl + '/deal/' + dealId;
    try {
      const { data: inviteRow } = await service
        .from('deal_invites')
        .insert({
          search_id: dealId,
          firm_id: me.firm_id,
          participant_id: (participant as any).id,
          role: p.role,
          name: p.name || null,
          email: p.email,
          created_by: me.user_id,
        })
        .select('token')
        .single();
      if (inviteRow) inviteUrl = siteUrl + '/invite/' + (inviteRow as any).token;
    } catch (e: any) {
      console.error('[attorney/new] deal_invites failed', e?.message || e);
    }

    const rolePretty = p.role.replace(/_/g, ' ');
    const subject = `${attorneyName} added you to a real-estate deal`;
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px">
        <h2 style="font-size:20px;margin:0 0 12px">You've been added to a deal</h2>
        <p>${escapeHtml(attorneyName)} at <strong>${escapeHtml(firmName)}</strong> is coordinating <strong>${escapeHtml(name)}</strong> and added you as <strong>${escapeHtml(rolePretty)}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${inviteUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Accept invite &amp; open the deal &rarr;</a>
        </p>
        <p style="color:#94A3B8;font-size:12px">If the button doesn't work, paste this link into your browser: ${inviteUrl}</p>
      </div>`;
    const text = `${attorneyName} (${firmName}) added you to the deal "${name}" as ${rolePretty}.\n\nOpen it: ${inviteUrl}`;

    try {
      await notify({ email: p.email, subject, html, text });
    } catch (e: any) {
      console.error('[attorney/new] invite email failed', e?.message || e);
    }
  }

  redirect('/deal/' + dealId);
}
