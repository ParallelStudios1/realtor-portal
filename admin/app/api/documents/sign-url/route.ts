import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMe } from '@/lib/supabaseSsr';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * POST /api/documents/sign-url
 * Body: { storage_path: string }
 *
 * Issues a 5-minute signed URL against the private 'client-docs' Storage
 * bucket. Auth: cookie session (web) or Authorization: Bearer (mobile).
 *
 * Authorization rules:
 *   - Realtor / firm_admin whose firm_id matches path segment [0]: allowed.
 *   - Client who owns a client_searches row whose firm_id+id matches
 *     segments [0]+[1]: allowed.
 *   - Anyone else: 403.
 *
 * Always returns JSON; never an empty body.
 */

async function resolveCaller(req: Request) {
  const me = await getMe();
  if (me?.user_id) return { id: me.user_id, firm_id: me.firm_id, role: me.role };
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
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
  const { data: row } = await sb
    .from('users')
    .select('firm_id, role')
    .eq('id', data.user.id)
    .single();
  return {
    id: data.user.id,
    firm_id: (row?.firm_id as string) || null,
    role: (row?.role as string) || null,
  };
}

export async function POST(req: Request) {
  try {
    const me = await resolveCaller(req);
    if (!me?.id) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      storage_path?: string;
    };
    const path = body.storage_path?.trim();
    if (!path) {
      return NextResponse.json(
        { error: 'storage_path is required.' },
        { status: 400 }
      );
    }

    // Path is "{firm_id}/{search_id}/{timestamp}-{filename}". We need the
    // first two segments - leading slashes shouldn't appear, but be defensive.
    const segments = path.replace(/^\/+/, '').split('/');
    const pathFirmId = segments[0];
    const pathSearchId = segments[1];

    if (!pathFirmId || !pathSearchId) {
      return NextResponse.json(
        { error: 'Invalid storage_path.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();

    // Authorization. Three acceptable cases:
    //  1) Caller is realtor/firm_admin AND their firm_id matches the path.
    //  2) Caller is a client AND they own a client_searches row whose
    //     firm_id and id match the path.
    //  3) Caller is on deal_participants for this search with
    //     can_view_documents=true (attorney/inspector/lender/etc).
    let allowed = false;
    if (
      (me.role === 'realtor' ||
        me.role === 'firm_admin' ||
        me.role === 'super_admin') &&
      me.firm_id &&
      me.firm_id === pathFirmId
    ) {
      allowed = true;
    } else {
      const { data: search } = await service
        .from('client_searches')
        .select('id')
        .eq('id', pathSearchId)
        .eq('firm_id', pathFirmId)
        .eq('client_id', me.id)
        .maybeSingle();
      if (search?.id) allowed = true;
    }
    if (!allowed) {
      // Look up the caller's email so we can match deal_participants rows
      // that link by email (when the participant hasn't signed in yet).
      const { data: meRow } = await service
        .from('users')
        .select('email')
        .eq('id', me.id)
        .maybeSingle();
      const myEmail = (meRow?.email || '').toLowerCase();

      const { data: ptpRows } = await service
        .from('deal_participants')
        .select('id, can_view_documents, user_id, external_email, role')
        .eq('search_id', pathSearchId)
        .eq('firm_id', pathFirmId);

      const myRow = (ptpRows || []).find(
        (p: any) =>
          p.user_id === me.id ||
          (p.external_email && p.external_email.toLowerCase() === myEmail)
      );
      // Cross-firm realtors / co-realtors always get document access on
      // deals they collaborate on. Other roles need the visibility flag.
      if (
        myRow &&
        (['realtor', 'co_realtor'].includes(myRow.role) ||
          myRow.can_view_documents)
      ) {
        allowed = true;
      }

      // Legacy attorney: attached via client_searches.attorney_email (no
      // participant row). They can review documents on their closing.
      if (!allowed && myEmail) {
        const { data: legacy } = await service
          .from('client_searches')
          .select('id')
          .eq('id', pathSearchId)
          .eq('firm_id', pathFirmId)
          .ilike('attorney_email', myEmail)
          .maybeSingle();
        if (legacy?.id) allowed = true;
      }
    }

    if (!allowed) {
      return NextResponse.json(
        { error: 'You do not have access to this document.' },
        { status: 403 }
      );
    }

    const { data, error } = await service.storage
      .from('client-docs')
      .createSignedUrl(path, 300);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || 'Could not sign URL.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (err: any) {
    console.error('[documents/sign-url] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
