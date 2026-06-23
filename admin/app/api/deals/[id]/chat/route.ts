import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notifyDealParticipants } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DEAL GROUP CHAT - Bearer/cookie JSON API for the native mobile app.
 *
 * Mirrors the server actions in
 *   admin/app/dashboard/deals/[id]/chatActions.ts (getDealChat / postDealChatMessage)
 * exactly:
 *   - Authorization (read AND post): caller is firm staff on the deal's host
 *     firm, OR the principal client (client_searches.client_id == caller), OR a
 *     deal_participants row on this search with can_view_messages = true
 *     (matched by user_id OR case-insensitive external_email). Else 403.
 *   - Group thread = messages on the search_id WHERE recipient_user_id IS NULL,
 *     oldest-first. (public.messages has NO `private` column.)
 *
 * GET  /api/deals/[id]/chat
 *   → { ok:true, messages:[{ id, body, sender_id, senderName, senderIsYou, created_at }], meUserId }
 * POST /api/deals/[id]/chat  body { body }
 *   → { ok:true, message:{ ...same shape } }
 */

/**
 * Resolve the caller from EITHER a web cookie session (getMe) OR a mobile
 * `Authorization: Bearer <supabase access_token>` header.
 */
async function resolveCaller(req: Request): Promise<{
  user_id: string;
  firm_id: string | null;
  email: string | null;
  role: string | null;
} | null> {
  const me = await getMe();
  if (me?.user_id) {
    return {
      user_id: me.user_id,
      firm_id: me.firm_id ?? null,
      email: me.email ?? null,
      role: me.role ?? null,
    };
  }
  const authz = req.headers.get('authorization') || '';
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${m[1]}` } },
      auth: { persistSession: false },
    }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const service = getSupabaseServiceRoleClient();
  const { data: row } = await service
    .from('users')
    .select('firm_id, role')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    user_id: data.user.id,
    firm_id: (row as any)?.firm_id ?? null,
    email: data.user.email ?? null,
    role: (row as any)?.role ?? null,
  };
}

type DealRow = { id: string; firm_id: string; client_id: string | null };
type Caller = NonNullable<Awaited<ReturnType<typeof resolveCaller>>>;

/**
 * Centralised authorization rule shared by GET + POST. Mirrors
 * authorizeDealChat() from chatActions.ts. Returns the deal row on success or
 * a JSON error response (with the right HTTP status) on failure.
 */
async function authorizeDealChat(
  req: Request,
  searchId: string
): Promise<
  | { ok: true; me: Caller; deal: DealRow }
  | { ok: false; res: NextResponse }
> {
  const me = await resolveCaller(req);
  if (!me?.user_id) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      ),
    };
  }

  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id, client_id')
    .eq('id', searchId)
    .maybeSingle();
  if (!deal) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: 'Deal not found.' },
        { status: 404 }
      ),
    };
  }
  const d = deal as DealRow;

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
    isMsgParticipant = (rows || []).some(
      (r: any) => r.can_view_messages === true
    );
  }

  if (!isStaffSameFirm && !isPrincipalClient && !isMsgParticipant) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: 'You do not have access to this deal chat.' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, me, deal: d };
}

type DealChatMessage = {
  id: string;
  body: string;
  sender_id: string | null;
  senderName: string;
  senderIsYou: boolean;
  created_at: string;
};

/**
 * Resolve sender_id → display name for a batch of messages. Safe with the
 * service role: only runs AFTER the caller is authorized, and only exposes a
 * display name (full_name/email), never private fields.
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
    body: r.body,
    sender_id: r.sender_id,
    senderName: r.sender_id
      ? nameById.get(r.sender_id) || 'Someone'
      : 'Someone',
    senderIsYou: !!r.sender_id && r.sender_id === meUserId,
    created_at: r.created_at,
  }));
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeDealChat(req, params.id);
    if (!auth.ok) return auth.res;
    const { me } = auth;

    const service = getSupabaseServiceRoleClient();
    // Group thread = messages on the deal with NO private recipient. 1:1 DMs
    // set recipient_user_id; group/deal-chat messages leave it null.
    const { data, error } = await service
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('search_id', params.id)
      .is('recipient_user_id', null)
      .order('created_at', { ascending: true });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Hide messages from anyone this caller has blocked (UGC requirement).
    const { data: blocks } = await service
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', me.user_id);
    const blockedIds = new Set((blocks || []).map((b: any) => b.blocked_id));
    const visible = ((data || []) as any[]).filter(
      (m) => !m.sender_id || !blockedIds.has(m.sender_id)
    );

    const messages = await decorateSenders(visible, me.user_id);
    return NextResponse.json({ ok: true, messages, meUserId: me.user_id });
  } catch (err: any) {
    console.error('[/api/deals/[id]/chat GET]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeDealChat(req, params.id);
    if (!auth.ok) return auth.res;
    const { me, deal } = auth;

    const json = (await req.json().catch(() => ({}))) as { body?: string };
    const text = (json.body || '').trim();
    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Message is empty.' },
        { status: 400 }
      );
    }
    if (text.length > 8000) {
      return NextResponse.json(
        { ok: false, error: 'Message is too long.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data: inserted, error } = await service
      .from('messages')
      .insert({
        firm_id: deal.firm_id,
        search_id: params.id,
        sender_id: me.user_id,
        // Group/deal-chat message: no private recipient.
        recipient_user_id: null,
        body: text,
      })
      .select('id, sender_id, body, created_at')
      .single();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Best-effort fan-out to the other parties on the deal. Never blocks the
    // post - failures are swallowed so the message still lands.
    try {
      const preview = text.length > 140 ? text.slice(0, 140) + '…' : text;
      await notifyDealParticipants({
        searchId: params.id,
        subject: 'New message on your deal',
        text: `Someone posted in the deal chat:\n\n${preview}`,
        excludeUserId: me.user_id,
      });
    } catch (err) {
      console.error('[/api/deals/[id]/chat POST] notify failed', err);
    }

    const [message] = await decorateSenders([inserted as any], me.user_id);
    return NextResponse.json({ ok: true, message });
  } catch (err: any) {
    console.error('[/api/deals/[id]/chat POST]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
