import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { runDeadlineCron } from '@/lib/deadlines';
import { runShowingDigestCron } from '@/lib/showingDigest';
import { runTrialReminderCron } from '@/lib/trialReminders';
import { runOverdueDatesCron } from '@/lib/overdueDates';
import { runRealtorReminderCron } from '@/lib/realtorReminders';
import { runStatsDigestCron } from '@/lib/statsDigest';

/**
 * Daily cron - runs the deadline-reminder/escalation pass and the seller-facing
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
  // Vercel Cron sends CRON_SECRET; STATUS_CHECK_SECRET is accepted too so
  // the cron can be triggered manually for diagnostics.
  const expected = process.env.CRON_SECRET;
  const alt = process.env.STATUS_CHECK_SECRET;
  if (expected || alt) {
    const got = req.headers.get('authorization') || '';
    const ok =
      (expected && got === 'Bearer ' + expected) ||
      (alt && got === 'Bearer ' + alt);
    if (!ok) {
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

  let trial: any;
  try {
    trial = await runTrialReminderCron(service);
  } catch (err: any) {
    console.error('[cron/daily] runTrialReminderCron failed', err);
    trial = { error: err?.message || 'runTrialReminderCron failed' };
  }

  let overdue: any;
  try {
    overdue = await runOverdueDatesCron(service);
  } catch (err: any) {
    console.error('[cron/daily] runOverdueDatesCron failed', err);
    overdue = { error: err?.message || 'runOverdueDatesCron failed' };
  }

  let realtorReminders: any;
  try {
    realtorReminders = await runRealtorReminderCron(service);
  } catch (err: any) {
    console.error('[cron/daily] runRealtorReminderCron failed', err);
    realtorReminders = { error: err?.message || 'runRealtorReminderCron failed' };
  }

  let statsDigest: any;
  try {
    statsDigest = await runStatsDigestCron(service);
  } catch (err: any) {
    console.error('[cron/daily] runStatsDigestCron failed', err);
    statsDigest = { error: err?.message || 'runStatsDigestCron failed' };
  }

  return NextResponse.json({
    ok: true,
    deadline,
    digest,
    trial,
    overdue,
    realtorReminders,
    statsDigest,
  });
}
