'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notify } from '@/lib/notify';

/**
 * PRIVATE (1:1) MESSAGES on a deal.
 *
 * Distinct from the deal GROUP chat (chatActions.ts). A private message is
 * between the caller and ONE specific other party on the deal — only those two
 * can read it. Used by the attorney's "Private messages" panel and any party's
 * private DMs.
 *
 * We authorize with the service role (same pattern as the group chat) so we can
 * support staff↔participant DMs, which the table RLS can't express (staff have
 * no deal_participants row). Reads/writes are gated by deal participation.
 */

export type PrivateParty = {
  /** Stable key for the UI (userId or lower-cased email). */
  key: string;
  userId: string | null;
  email: string | null;
  name: string;
  role: string;
};

export type PrivateMessage = {
  id: string;
  body: string;
  created_at: string;
  fromMe: boolean;
  senderName: string;
};

const STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
];

type AuthOk = {
  me: NonNullable<Awaited<ReturnType<typeof getMe>>>;
  deal: { id: string; firm_id: string; client_id: string | null };
};

async function authorize(
  searchId: string
): Promise<{ error: string } | AuthOk> {
  const me = await getMe();
  if (!me?.user_id) return { error: 'Not authenticated.' };
  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id, client_id')
    .eq('id', searchId)
    .maybeSingle();
  if (!deal) return { error: 'Deal not found.' };
  const d = deal as { id: string; firm_id: string; client_id: string | null };

  const isStaff =
    !!me.firm_id && me.firm_id === d.firm_id && STAFF_ROLES.includes(me.role || '');
  const isClient = d.client_id === me.user_id;
  let isParticipant = false;
  if (!isStaff && !isClient) {
    const { data: rows } = await service
      .from('deal_participants')
      .select('id')
      .eq('search_id', searchId)
      .or(
        [
          `user_id.eq.${me.user_id}`,
          me.email ? `external_email.ilike.${me.email}` : null,
        ]
          .filter(Boolean)
          .join(',')
      )
      .limit(1);
    isParticipant = (rows || []).length > 0;
  }
  if (!isStaff && !isClient && !isParticipant)
    return { error: 'You do not have access to this deal.' };
  return { me, deal: d };
}

/**
 * The set of parties on the deal the caller can privately message: the realtor,
 * the principal client, and every other participant — excluding the caller.
 */
export async function getPrivateParties(
  searchId: string
): Promise<{ ok: true; parties: PrivateParty[] } | { ok: false; error: string }> {
  const auth = await authorize(searchId);
  if ('error' in auth) return { ok: false, error: auth.error };
  const { me } = auth;
  const service = getSupabaseServiceRoleClient();

  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id,
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', searchId)
    .maybeSingle();
  const dd = deal as any;

  const parties: PrivateParty[] = [];
  const pushParty = (p: PrivateParty) => {
    if (p.userId && p.userId === me.user_id) return;
    if (p.email && me.email && p.email.toLowerCase() === me.email.toLowerCase())
      return;
    const exists = parties.some(
      (x) =>
        (p.userId && x.userId === p.userId) ||
        (p.email && x.email && x.email.toLowerCase() === p.email!.toLowerCase())
    );
    if (!exists) parties.push(p);
  };

  if (dd?.realtor?.id)
    pushParty({
      key: dd.realtor.id,
      userId: dd.realtor.id,
      email: dd.realtor.email,
      name: dd.realtor.full_name || dd.realtor.email || 'Realtor',
      role: 'realtor',
    });
  if (dd?.client?.id)
    pushParty({
      key: dd.client.id,
      userId: dd.client.id,
      email: dd.client.email,
      name: dd.client.full_name || dd.client.email || 'Client',
      role: 'client',
    });

  const { data: ptp } = await service
    .from('deal_participants')
    .select('user_id, external_email, external_name, role')
    .eq('search_id', searchId);
  for (const p of (ptp as any[]) || []) {
    const email = p.external_email || null;
    pushParty({
      key: p.user_id || (email ? email.toLowerCase() : Math.random().toString()),
      userId: p.user_id || null,
      email,
      name: p.external_name || email || p.role,
      role: p.role,
    });
  }

  return { ok: true, parties };
}

/** Read the private thread between the caller and one counterpart on the deal. */
export async function getPrivateThread(
  searchId: string,
  counterpart: { userId?: string | null; email?: string | null }
): Promise<{ ok: true; messages: PrivateMessage[] } | { ok: false; error: string }> {
  const auth = await authorize(searchId);
  if ('error' in auth) return { ok: false, error: auth.error };
  const { me } = auth;
  const service = getSupabaseServiceRoleClient();

  const cpUser = counterpart.userId || null;
  const cpEmail = (counterpart.email || '').toLowerCase() || null;
  const myEmail = (me.email || '').toLowerCase();

  // Pull every private message on this deal, then filter to the pair in JS
  // (clearer than a giant OR; threads are small).
  const { data, error } = await service
    .from('messages')
    .select('id, sender_id, recipient_user_id, recipient_email, body, created_at')
    .eq('search_id', searchId)
    .not('recipient_user_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return { ok: false, error: error.message };

  const matchesCp = (uid: string | null, em: string | null) =>
    (cpUser && uid === cpUser) ||
    (cpEmail && (em || '').toLowerCase() === cpEmail);
  const matchesMe = (uid: string | null, em: string | null) =>
    uid === me.user_id || (myEmail && (em || '').toLowerCase() === myEmail);

  const rows = ((data as any[]) || []).filter((m) => {
    const fromMeToCp =
      matchesMe(m.sender_id, null) &&
      matchesCp(m.recipient_user_id, m.recipient_email);
    const fromCpToMe =
      matchesCp(m.sender_id, null) &&
      matchesMe(m.recipient_user_id, m.recipient_email);
    return fromMeToCp || fromCpToMe;
  });

  // Resolve sender names.
  const ids = Array.from(
    new Set(rows.map((r) => r.sender_id).filter((x): x is string => !!x))
  );
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: us } = await service
      .from('users')
      .select('id, full_name, email')
      .in('id', ids);
    for (const u of (us as any[]) || [])
      nameById.set(u.id, u.full_name || u.email || 'Someone');
  }

  const messages: PrivateMessage[] = rows.map((m) => ({
    id: m.id,
    body: m.body,
    created_at: m.created_at,
    fromMe: m.sender_id === me.user_id,
    senderName: m.sender_id ? nameById.get(m.sender_id) || 'Someone' : 'Someone',
  }));
  return { ok: true, messages };
}

/** Send a private message to one counterpart on the deal. */
export async function sendPrivateMessage(
  searchId: string,
  counterpart: { userId?: string | null; email?: string | null },
  body: string
): Promise<{ ok: true; message: PrivateMessage } | { ok: false; error: string }> {
  const auth = await authorize(searchId);
  if ('error' in auth) return { ok: false, error: auth.error };
  const { me, deal } = auth;
  const text = (body || '').trim();
  if (!text) return { ok: false, error: 'Message is empty.' };
  if (!counterpart.userId && !counterpart.email)
    return { ok: false, error: 'Pick someone to message.' };

  const service = getSupabaseServiceRoleClient();
  const { data: inserted, error } = await service
    .from('messages')
    .insert({
      firm_id: deal.firm_id,
      search_id: searchId,
      sender_id: me.user_id,
      recipient_user_id: counterpart.userId || null,
      recipient_email: counterpart.userId ? null : counterpart.email,
      body: text,
    })
    .select('id, body, created_at')
    .single();
  if (error) return { ok: false, error: error.message };

  // Best-effort notify the recipient.
  try {
    const preview = text.length > 140 ? text.slice(0, 140) + '…' : text;
    await notify({
      email: counterpart.email || null,
      subject: 'New private message on your deal',
      text: `${me.full_name || 'Someone'} sent you a private message:\n\n${preview}`,
    });
  } catch {}

  revalidatePath('/dashboard/deals/' + searchId);
  revalidatePath('/deal/' + searchId);
  revalidatePath('/attorney/deals/' + searchId);

  return {
    ok: true,
    message: {
      id: (inserted as any).id,
      body: (inserted as any).body,
      created_at: (inserted as any).created_at,
      fromMe: true,
      senderName: me.full_name || 'You',
    },
  };
}
