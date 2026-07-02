import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller, type Caller } from '@/lib/bearerAuth';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PRIVATE (1:1) DEAL MESSAGES - Bearer/cookie JSON API for the native
 * mobile app. Mirrors privateActions.ts (getPrivateThread/sendPrivateMessage)
 * and sendPrivatePartyMessageAction. Service-role backed because staff have
 * no deal_participants row, which table RLS can't express.
 *
 * GET  /api/messages/private?search_id=...&user_id=...&email=...
 *   → { ok:true, messages: [{ id, body, created_at, fromMe, senderName }] }
 * POST /api/messages/private  body { search_id, user_id?, email?, body }
 *   → { ok:true, message } | { ok:false, error }
 */

const STAFF_ROLES = [
  'realtor',
  'firm_admin',
  'super_admin',
  'owner',
  'manager',
  'agent',
];

async function authorize(
  me: Caller,
  searchId: string
): Promise<
  | { error: string; status: number }
  | { deal: { id: string; firm_id: string; client_id: string | null } }
> {
  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select('id, firm_id, client_id')
    .eq('id', searchId)
    .maybeSingle();
  if (!deal) return { error: 'Deal not found.', status: 404 };
  const d = deal as { id: string; firm_id: string; client_id: string | null };

  const isStaff =
    !!me.firm_id &&
    me.firm_id === d.firm_id &&
    STAFF_ROLES.includes(me.role || '');
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
    return { error: 'You do not have access to this deal.', status: 403 };
  return { deal: d };
}

export async function GET(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    const url = new URL(req.url);
    const searchId = url.searchParams.get('search_id') || '';
    const cpUser = url.searchParams.get('user_id') || null;
    const cpEmail = (url.searchParams.get('email') || '').toLowerCase() || null;
    if (!searchId || (!cpUser && !cpEmail)) {
      return NextResponse.json(
        { ok: false, error: 'search_id and a counterpart are required.' },
        { status: 400 }
      );
    }

    const a = await authorize(me, searchId);
    if ('error' in a) {
      return NextResponse.json(
        { ok: false, error: a.error },
        { status: a.status }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data, error } = await service
      .from('messages')
      .select('id, sender_id, recipient_user_id, recipient_email, body, created_at')
      .eq('search_id', searchId)
      .not('recipient_user_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Also pull email-recipient DMs (recipient_user_id null, recipient_email set).
    const { data: emailRows } = await service
      .from('messages')
      .select('id, sender_id, recipient_user_id, recipient_email, body, created_at')
      .eq('search_id', searchId)
      .is('recipient_user_id', null)
      .not('recipient_email', 'is', null)
      .order('created_at', { ascending: true })
      .limit(500);

    const myEmail = (me.email || '').toLowerCase();
    const matchesCp = (uid: string | null, em: string | null) =>
      (cpUser && uid === cpUser) ||
      (cpEmail && (em || '').toLowerCase() === cpEmail);
    const matchesMe = (uid: string | null, em: string | null) =>
      uid === me.user_id || (!!myEmail && (em || '').toLowerCase() === myEmail);

    const all = ([...(data || []), ...(emailRows || [])] as any[]).sort(
      (x, y) =>
        new Date(x.created_at).getTime() - new Date(y.created_at).getTime()
    );
    const rows = all.filter((m) => {
      const fromMeToCp =
        matchesMe(m.sender_id, null) &&
        matchesCp(m.recipient_user_id, m.recipient_email);
      const fromCpToMe =
        matchesCp(m.sender_id, null) &&
        matchesMe(m.recipient_user_id, m.recipient_email);
      return fromMeToCp || fromCpToMe;
    });

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

    return NextResponse.json({
      ok: true,
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        fromMe: m.sender_id === me.user_id,
        senderName: m.sender_id
          ? nameById.get(m.sender_id) || 'Someone'
          : 'Someone',
      })),
    });
  } catch (err: any) {
    console.error('[/api/messages/private GET]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.user_id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }
    const json = (await req.json().catch(() => ({}))) as {
      search_id?: string;
      user_id?: string | null;
      email?: string | null;
      body?: string;
    };
    const searchId = json.search_id || '';
    const text = (json.body || '').trim();
    if (!searchId) {
      return NextResponse.json(
        { ok: false, error: 'Deal is required.' },
        { status: 400 }
      );
    }
    if (!text) {
      return NextResponse.json(
        { ok: false, error: 'Message is empty.' },
        { status: 400 }
      );
    }
    if (!json.user_id && !json.email) {
      return NextResponse.json(
        { ok: false, error: 'Pick someone to message.' },
        { status: 400 }
      );
    }

    const a = await authorize(me, searchId);
    if ('error' in a) {
      return NextResponse.json(
        { ok: false, error: a.error },
        { status: a.status }
      );
    }

    const service = getSupabaseServiceRoleClient();
    const { data: inserted, error } = await service
      .from('messages')
      .insert({
        firm_id: a.deal.firm_id,
        search_id: searchId,
        sender_id: me.user_id,
        recipient_user_id: json.user_id || null,
        recipient_email: json.user_id ? null : json.email,
        body: text,
      })
      .select('id, body, created_at')
      .single();
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Best-effort notify the recipient (email + phone when resolvable).
    try {
      const siteUrl =
        process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';
      const dealUrl = siteUrl + '/deal/' + searchId;
      const preview = text.length > 140 ? text.slice(0, 140) + '…' : text;
      let recipientEmail: string | null = json.email || null;
      let recipientPhone: string | null = null;
      if (json.user_id) {
        const { data: u } = await service
          .from('users')
          .select('email, phone')
          .eq('id', json.user_id)
          .maybeSingle();
        recipientEmail = (u as any)?.email ?? recipientEmail;
        recipientPhone = (u as any)?.phone ?? null;
      }
      const senderName = 'Someone on your deal';
      const { data: sender } = await service
        .from('users')
        .select('full_name, email')
        .eq('id', me.user_id)
        .maybeSingle();
      const name =
        (sender as any)?.full_name || (sender as any)?.email || senderName;
      await notify({
        email: recipientEmail,
        phone: recipientPhone,
        subject: 'Private message from ' + name,
        text:
          name +
          ' sent you a private message on the deal:\n\n' +
          preview +
          '\n\nReply in the deal: ' +
          dealUrl,
        html: `<p><strong>${escapeHtml(
          name
        )}</strong> sent you a private message on the deal:</p><p>${escapeHtml(
          preview
        )}</p><p><a href="${dealUrl}">Reply in the deal &rarr;</a></p>`,
        sms_text: name + ' (private): ' + text.slice(0, 240) + ' - ' + dealUrl,
      });
    } catch (e: any) {
      console.error('[/api/messages/private POST] notify failed', e?.message || e);
    }

    return NextResponse.json({
      ok: true,
      message: {
        id: (inserted as any).id,
        body: (inserted as any).body,
        created_at: (inserted as any).created_at,
        fromMe: true,
        senderName: 'You',
      },
    });
  } catch (err: any) {
    console.error('[/api/messages/private POST]', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
