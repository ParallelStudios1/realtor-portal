import { NextResponse, type NextRequest } from 'next/server';
import { getMe } from '@/lib/supabaseSsr';
import { emailEveryoneDealEvent } from '@/lib/dealEmail';
import { sendEmail } from '@/lib/email';
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

  const visibility: string = body.visibility || 'everyone';
  const ctaUrl =
    (process.env.SITE_URL || 'https://realtorportal.parallelstudios.co') +
    '/deal/' +
    body.searchId;
  const headline =
    'New ' + (body.folder ? body.folder.toLowerCase() + ' ' : '') +
    'document' + (body.names.length > 1 ? 's' : '') + ' shared';

  // 'firm' = private to the team: notify nobody outside the firm.
  if (visibility === 'firm') {
    return NextResponse.json({ ok: true, notified: 'none' });
  }

  // 'restricted' = only the explicitly-chosen recipients get an email.
  if (visibility === 'restricted') {
    const emails: string[] = Array.isArray(body.recipientEmails)
      ? body.recipientEmails.filter(
          (e: unknown): e is string => typeof e === 'string' && e.includes('@')
        )
      : [];
    for (const to of emails) {
      await sendEmail({
        to,
        subject: headline,
        text:
          'A document was shared with you on your deal: ' + fileList +
          '.\n\nView it here: ' + ctaUrl,
      });
    }
    return NextResponse.json({ ok: true, notified: emails.length });
  }

  // 'everyone' (default): fan out to all parties on the deal.
  await emailEveryoneDealEvent({
    searchId: body.searchId,
    subjectPrefix: 'New document' + (body.names.length > 1 ? 's' : '') + ' shared',
    headline,
    body: 'Your realtor just shared ' + fileList + ' on the deal.',
    ctaUrl,
    ctaLabel: 'View documents',
  });

  return NextResponse.json({ ok: true, notified: 'everyone' });
}
