import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { runDeadlineCron } from '@/lib/deadlines';
import { runShowingDigestCron } from '@/lib/showingDigest';

/**
 * Daily cron — runs the deadline-reminder/escalation pass and the seller-facing
 * showing-feedback digest. Both run independently: if one throws, we capture the
 * error and still attempt the other.
 *
 * Auth mirrors /api/cron/drips: Vercel Cron sends
 *   Authorization: Bearer ${CRON_SECRET}
 * Drop the same value into the Vercel project env. Without it (when set) we 401.
 *
 * Vercel cron config (vercel.json):
 *   { "crons": [{ "path": "/api/cron/daily", "schedule": "0 13 * * *" }] }
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get('authorization') || '';
    if (got !== 'Bearer ' + expected) {
      return NextResponse.json({ error: 'forbidden' }, { status: 401 });
    }
  }

  const service = getSupabaseServiceRoleClient();

  let deadline: any;
  try {
    deadline = await runDeadlineCron(service);
  } catch (err: any) {
    console.error('[cron/daily] runDeadlineCron failed', err);
    deadline = { error: err?.message || 'runDeadlineCron failed' };
  }

  let digest: any;
  try {
    digest = await runShowingDigestCron(service);
  } catch (err: any) {
    console.error('[cron/daily] runShowingDigestCron failed', err);
    digest = { error: err?.message || 'runShowingDigestCron failed' };
  }

  return NextResponse.json({ ok: true, deadline, digest });
}
