import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

/**
 * "Congrats — here's what you did" recap email for realtors.
 *
 * Cadence lives on users.stats_email_cadence ('off' | 'monthly' | 'annual').
 *   - monthly recaps fire on the 1st of each month, covering the month prior.
 *   - annual recaps fire on Jan 1, covering the year prior.
 * We only email realtors who actually closed at least one deal in the period —
 * nobody wants a "you closed 0 homes" note. last_sent_on guards double-sends.
 */

const STAFF_ROLES = new Set([
  'realtor', 'firm_admin', 'super_admin', 'owner', 'manager', 'agent',
]);

type Period = {
  cadence: 'monthly' | 'annual';
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  label: string; // "March 2026" / "2026"
};

/** Which recap period(s), if any, fire today (UTC). */
export function periodsFiringToday(now = new Date()): Period[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  const d = now.getUTCDate();
  const out: Period[] = [];
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const fmt = (yy: number, mm0: number, dd: number) =>
    `${yy}-${String(mm0 + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

  if (d === 1) {
    // Previous calendar month.
    const pm0 = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    const lastDay = new Date(Date.UTC(py, pm0 + 1, 0)).getUTCDate();
    out.push({
      cadence: 'monthly',
      start: fmt(py, pm0, 1),
      end: fmt(py, pm0, lastDay),
      label: `${MONTHS[pm0]} ${py}`,
    });
  }
  if (m === 0 && d === 1) {
    // Previous calendar year.
    out.push({
      cadence: 'annual',
      start: fmt(y - 1, 0, 1),
      end: fmt(y - 1, 11, 31),
      label: `${y - 1}`,
    });
  }
  return out;
}

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export async function runStatsDigestCron(service: SupabaseClient): Promise<{
  periods: number;
  emailed: number;
  skipped: number;
}> {
  const periods = periodsFiringToday();
  if (periods.length === 0) return { periods: 0, emailed: 0, skipped: 0 };

  const today = new Date().toISOString().slice(0, 10);
  let emailed = 0;
  let skipped = 0;

  for (const period of periods) {
    // Realtors opted into this cadence who haven't already been sent today.
    const { data: realtors } = await service
      .from('users')
      .select('id, full_name, email, role, stats_email_cadence, stats_email_last_sent_on')
      .eq('stats_email_cadence', period.cadence);

    const eligible = ((realtors as any[] | null) || []).filter(
      (r) =>
        STAFF_ROLES.has(r.role || '') &&
        r.email &&
        r.stats_email_last_sent_on !== today
    );
    if (eligible.length === 0) continue;

    // Closed deals in the window, aggregated by realtor in one pass.
    const { data: closed } = await service
      .from('client_searches')
      .select('realtor_id, closing_amount, closing_date, phase')
      .eq('phase', 'closed')
      .gte('closing_date', period.start)
      .lte('closing_date', period.end);

    const byRealtor = new Map<string, { count: number; volume: number }>();
    for (const row of (closed as any[] | null) || []) {
      if (!row.realtor_id) continue;
      const agg = byRealtor.get(row.realtor_id) || { count: 0, volume: 0 };
      agg.count += 1;
      agg.volume += Number(row.closing_amount || 0);
      byRealtor.set(row.realtor_id, agg);
    }

    for (const r of eligible) {
      const agg = byRealtor.get(r.id);
      if (!agg || agg.count === 0) {
        skipped++;
        continue; // no celebratory numbers → no email this period
      }
      const name = (r.full_name || '').split(' ')[0] || 'there';
      const dealWord = agg.count === 1 ? 'deal' : 'deals';
      const volumeLine =
        agg.volume > 0
          ? `<p style="font-size:15px">That's <strong>${money(agg.volume)}</strong> in closed volume.</p>`
          : '';

      const res = await sendEmail({
        to: r.email,
        subject: `Your ${period.label} recap: ${agg.count} closed`,
        text:
          `Congrats ${name}! You closed ${agg.count} ${dealWord} in ${period.label}` +
          (agg.volume > 0 ? ` — ${money(agg.volume)} in volume` : '') +
          `. Here's to the next one.`,
        html:
          `<div style="font-family:system-ui;max-width:560px;padding:24px">` +
          `<h2 style="margin:0 0 12px">Congrats, ${String(name).replace(/[<>]/g, '')}! 🎉</h2>` +
          `<p style="font-size:16px">You closed <strong>${agg.count} ${dealWord}</strong> in ${period.label}.</p>` +
          volumeLine +
          `<p style="font-size:15px;color:#334155">Here's to the next one.</p>` +
          `<p style="color:#94A3B8;font-size:12px;margin-top:28px">You're getting this because your ${period.cadence} recap is on. Change it in Settings.</p>` +
          `</div>`,
      });

      if (res) {
        emailed++;
        await service
          .from('users')
          .update({ stats_email_last_sent_on: today })
          .eq('id', r.id);
      } else {
        skipped++;
      }
    }
  }

  return { periods: periods.length, emailed, skipped };
}
