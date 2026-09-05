import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/bearerAuth';
import { isDealStaff } from '@/lib/staff';
import { lookupFmlsListing, fmlsMode } from '@/lib/fmls/provider';
import { firmHasFmls } from '@/lib/fmls/entitlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/fmls/lookup?mls=7412345
 *
 * Auth: cookie session (web) or Bearer token (mobile) — same dual path as
 * every other mobile-capable route. Staff only: FMLS license content is for
 * the subscribing agent/firm, never exposed to buyers/sellers directly; what
 * they see is the house record their agent created from it.
 *
 * Returns { ok, source: 'live'|'mock', house: <addHouseAction payload> }.
 *
 * Billing note: when the FMLS add-on ships, this route additionally checks
 * the firm's add-on entitlement (firms.fmls_active). Until credentials and
 * pricing exist, mode 'off' keeps the whole feature dark in production.
 */
export async function GET(req: Request) {
  const me = await resolveCaller(req);
  if (!me) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  if (!isDealStaff(me as any) || !me.firm_id) {
    return NextResponse.json(
      { error: 'FMLS lookup is available to firm staff only.' },
      { status: 403 }
    );
  }
  if (fmlsMode() === 'off') {
    return NextResponse.json(
      { error: 'FMLS integration is not enabled yet.' },
      { status: 503 }
    );
  }
  // Paid add-on, firm-level, no free trial: FMLS bills us per subscriber
  // from day one, so the feature is dark until the firm buys the add-on.
  if (!(await firmHasFmls(req, me.firm_id))) {
    return NextResponse.json(
      {
        error:
          'FMLS integration is a paid add-on your firm has not enabled yet. An admin can add it from Billing.',
        upgrade: 'fmls',
      },
      { status: 402 }
    );
  }

  const mls = new URL(req.url).searchParams.get('mls') || '';
  const result = await lookupFmlsListing(mls);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    source: result.source,
    house: result.house,
  });
}
