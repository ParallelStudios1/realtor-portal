import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * POST /api/notifications/send-push
 *
 * Body: { searchId: string, messageId?: string, kind?: 'message' | 'tour' | 'document' | 'generic', title?: string, body?: string }
 *
 * Sends an Expo push notification to every participant in the conversation
 * except the caller. Looks up tokens in public.push_tokens.
 *
 * Auth: cookie session (web) or Bearer token (mobile).
 *
 * Always returns JSON. If anything fails per-token, the rest are still sent.
 */
type Input = {
  searchId: string;
  messageId?: string;
  kind?: 'message' | 'tour' | 'document' | 'generic';
  title?: string;
  body?: string;
};

async function resolveCaller(req: Request) {
  const me = await getMe();
  if (me?.user_id) return { id: me.user_id, firm_id: me.firm_id };
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${m[1]}` } }, auth: { persistSession: false } }
  );
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const { data: row } = await sb.from('users').select('firm_id').eq('id', data.user.id).single();
  return { id: data.user.id, firm_id: (row?.firm_id as string) || null };
}

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const input = (await req.json().catch(() => ({}))) as Input;
    if (!input.searchId) {
      return NextResponse.json({ error: 'searchId required' }, { status: 400 });
    }

    const service = getSupabaseServiceRoleClient();

    // Find the search → resolves client_id and realtor_id
    const { data: search, error: searchErr } = await service
      .from('client_searches')
      .select('id, client_id, realtor_id, firm_id')
      .eq('id', input.searchId)
      .single();
    if (searchErr || !search) {
      return NextResponse.json({ error: 'Search not found.' }, { status: 404 });
    }
    if (search.firm_id !== me.firm_id) {
      // Cross-firm send — block.
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Recipients are everyone in the thread except the caller
    const recipientIds = [search.client_id, search.realtor_id].filter(
      (id): id is string => !!id && id !== me.id
    );
    if (recipientIds.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no recipients' });
    }

    const { data: tokens } = await service
      .from('push_tokens')
      .select('token, user_id, platform')
      .in('user_id', recipientIds);

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 'no tokens' });
    }

    // Resolve sender display name + (optional) message body for the alert
    let title = input.title || 'Realtor Portal';
    let body = input.body || 'You have a new update.';
    if (input.kind === 'message' && input.messageId) {
      const { data: msg } = await service
        .from('messages')
        .select('body, sender_id')
        .eq('id', input.messageId)
        .single();
      if (msg?.body) body = msg.body.slice(0, 140);
      const { data: sender } = await service
        .from('users')
        .select('full_name')
        .eq('id', msg?.sender_id || me.id)
        .single();
      title = sender?.full_name || 'New message';
    }

    const messages = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title,
      body,
      data: {
        searchId: input.searchId,
        kind: input.kind || 'generic',
        messageId: input.messageId || null,
      },
    }));

    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
    const result = await r.json().catch(() => null);
    return NextResponse.json({ sent: messages.length, expo: result });
  } catch (err: any) {
    console.error('[notifications/send-push] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
