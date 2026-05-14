import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { emailEveryoneDealEvent } from '@/lib/dealEmail';
import { isFirmPlanActive } from '@/lib/planGate';

/**
 * Called by the upload client after a successful storage write + documents
 * insert. Server-side authorize, then fan out a "doc uploaded" email to
 * every party on the deal.
 *
 * Body: { searchId, names: string[], folder: string }
 */
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me?.firm_id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await isFirmPlanActive(me.firm_id))) {
    return NextResponse.json(
      { error: 'plan_inactive', code: 'plan_inactive' },
      { status: 402 }
    );
  }
  const body = await req.json().catch(() => null);
  if (!body?.searchId || !Array.isArray(body.names) || body.names.length === 0) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const fileList =
    body.names.length === 1
      ? body.names[0]
      : body.names.length + ' files';

  await emailEveryoneDealEvent({
    searchId: body.searchId,
    subjectPrefix: 'New document' + (body.names.length > 1 ? 's' : '') + ' shared',
    headline:
      'New ' + (body.folder ? body.folder.toLowerCase() + ' ' : '') +
      'document' + (body.names.length > 1 ? 's' : '') + ' shared',
    body: 'Your realtor just shared ' + fileList + ' on the deal.',
    ctaUrl:
      (process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app') +
      '/deal/' +
      body.searchId,
    ctaLabel: 'View documents',
  });

  return NextResponse.json({ ok: true });
}
