'use server';

import { revalidatePath } from 'next/cache';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notifyDealParticipants } from '@/lib/notify';

/**
 * DEAL GROUP CHAT — server actions.
 *
 * A single group thread for the WHOLE deal that every party with message
 * access can read and post to. It is DISTINCT from the 1:1 client↔realtor DM:
 *
 *   - Group messages  → `private = false` on a given `search_id`.
 *   - 1:1 DMs         → `private = true` (+ recipient_*).
 *
 * The group thread query therefore selects rows on the search where
 * `private IS NULL OR private = false`. The DM thread (the existing
 * /client/messages surface) is unaffected because it never set `private`
 * — but to keep the group thread clean we explicitly post group messages
 * with `private = false`.
 *
 * Authorization (read AND post) — a caller may participate in a deal's group
 * chat if ANY of the following holds:
 *   1. They are firm staff on the deal's host firm (realtor/firm_admin/owner/
 *      manager/agent/super_admin whose firm_id matches the deal's firm_id), OR
 *   2. They are the principal client (client_searches.client_id === me), OR
 *   3. They have a deal_participants row on this search with
 *      can_view_messages = true, matched by user_id OR (case-insensitive)
 *      external_email.
 * Anyone else is rejected.
 */

export type DealChatMessage = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  senderName: string;
  senderIsYou: boolean;
};

type Authorized = {
  me: NonNullable<Awaited<ReturnType<typeof getMe>>>;
  deal: { id: string; firm_id: string; client_id: string | null };
};

/**
 * Resolve the caller and confirm they may participate in this deal's group
 * chat. Returns the (service-role-read) deal row on success, or an error
 * string. Centralises the rule used by both the reader and the poster.
 */
async function authorizeDealChat(
  searchId: string
): Promise<{ error: string } | Authorized> {
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

  // 1. Firm staff on the deal's host firm.
  const isStaffSameFirm =
    !!me.firm_id &&
    me.firm_id === d.firm_id &&
    ['realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent'].includes(
      me.role || ''
    );

  // 2. Principal client.
  const isPrincipalClient = d.client_id === me.user_id;

  // 3. Participant with can_view_messages.
  let isMsgParticipant = false;
  if (!isStaffSameFirm && !isPrincipalClient) {
    const orClauses = [
      `user_id.eq.${me.user_id}`,
      me.email ? `external_email.ilike.${me.email}` : null,
    ]
      .filter(Boolean)
      .join(',');
    const { data: rows } = await service
      .from('deal_participants')
      .select('id, can_view_messages')
      .eq('search_id', searchId)
      .or(orClauses)
      .limit(5);
    isMsgParticipant = (rows || []).some((r: any) => r.can_view_messages === true);
  }

  if (!isStaffSameFirm && !isPrincipalClient && !isMsgParticipant) {
    return { error: 'You do not have access to this deal chat.' };
  }

  return { me, deal: d };
}

/**
 * Resolve sender_id → display name for a batch of messages. Uses the service
 * role (safe: we only run this AFTER the caller is authorized for the thread,
 * and we only expose a display name, never private fields).
 */
async function decorateSenders(
  rows: Array<{
    id: string;
    sender_id: string | null;
    body: string;
    created_at: string;
  }>,
  meUserId: string
): Promise<DealChatMessage[]> {
  const senderIds = Array.from(
    new Set(rows.map((r) => r.sender_id).filter((x): x is string => !!x))
  );
  const nameById = new Map<string, string>();
  if (senderIds.length > 0) {
    const service = getSupabaseServiceRoleClient();
    const { data: users } = await service
      .from('users')
      .select('id, full_name, email')
      .in('id', senderIds);
    for (const u of (users || []) as any[]) {
      nameById.set(u.id, u.full_name || u.email || 'Someone');
    }
  }
  return rows.map((r) => ({
    id: r.id,
    sender_id: r.sender_id,
    body: r.body,
    created_at: r.created_at,
    senderName: r.sender_id ? nameById.get(r.sender_id) || 'Someone' : 'Someone',
    senderIsYou: !!r.sender_id && r.sender_id === meUserId,
  }));
}

/**
 * Read the group thread for a deal. Authorizes the caller first, then returns
 * the group messages (private IS NULL OR private = false) with sender display
 * names, oldest-first.
 */
export async function getDealChat(searchId: string): Promise<
  | { ok: true; messages: DealChatMessage[]; meUserId: string }
  | { ok: false; error: string }
> {
  const auth = await authorizeDealChat(searchId);
  if ('error' in auth) return { ok: false as const, error: auth.error };
  const { me } = auth;

  const service = getSupabaseServiceRoleClient();
  // Group thread = messages on the deal with NO private recipient. 1:1 DMs set
  // recipient_user_id; group/deal-chat messages leave it null.
  const { data, error } = await service
    .from('messages')
    .select('id, sender_id, body, created_at')
    .eq('search_id', searchId)
    .is('recipient_user_id', null)
    .order('created_at', { ascending: true });
  if (error) return { ok: false as const, error: error.message };

  const messages = await decorateSenders(
    (data || []) as any[],
    me.user_id
  );
  return { ok: true as const, messages, meUserId: me.user_id };
}

/**
 * Post a message to the deal's group thread. Authorizes the caller (same rule
 * as reading), inserts a group message (private = false), best-effort notifies
 * the other parties, then revalidates the deal surfaces. Returns the inserted,
 * decorated message so the client can optimistically append it.
 */
export async function postDealChatMessage(
  searchId: string,
  body: string
): Promise<
  | { ok: true; message: DealChatMessage }
  | { ok: false; error: string }
> {
  const auth = await authorizeDealChat(searchId);
  if ('error' in auth) return { ok: false as const, error: auth.error };
  const { me, deal } = auth;

  const text = (body || '').trim();
  if (!text) return { ok: false as const, error: 'Message is empty.' };
  if (text.length > 8000)
    return { ok: false as const, error: 'Message is too long.' };

  const service = getSupabaseServiceRoleClient();
  const { data: inserted, error } = await service
    .from('messages')
    .insert({
      firm_id: deal.firm_id,
      search_id: searchId,
      sender_id: me.user_id,
      // Group/deal-chat message: no private recipient (recipient_user_id null).
      recipient_user_id: null,
      body: text,
    })
    .select('id, sender_id, body, created_at')
    .single();
  if (error) return { ok: false as const, error: error.message };

  // Best-effort fan-out to the other parties on the deal. Never blocks the
  // post — failures are swallowed so the message still lands.
  try {
    const preview = text.length > 140 ? text.slice(0, 140) + '…' : text;
    await notifyDealParticipants({
      searchId,
      subject: 'New message on your deal',
      text: `${me.full_name || 'Someone'} posted in the deal chat:\n\n${preview}`,
      excludeUserId: me.user_id,
    });
  } catch (err) {
    console.error('[postDealChatMessage] notify failed', err);
  }

  const [message] = await decorateSenders([inserted as any], me.user_id);

  revalidatePath('/dashboard/deals/' + searchId);
  revalidatePath('/deal/' + searchId);
  revalidatePath('/client');
  revalidatePath('/client/messages');

  return { ok: true as const, message };
}
