import { escapeHtml } from './email';
import { notify } from './notify';
import type { getSupabaseServiceRoleClient } from './supabaseServer';

type Service = ReturnType<typeof getSupabaseServiceRoleClient>;

/**
 * Overdue-date follow-up pass, run from /api/cron/daily.
 *
 * Important dates don't linger as stale "upcoming" items after they pass:
 *
 *  1. PROMPT - the day after an incomplete date passes, whoever created it
 *     (falling back to the deal's realtor) gets an email/text: "Did this
 *     happen? Tap the circle on the deal to mark it done, or move the date
 *     if it slipped." We stamp completion_prompt_sent_at so this fires once.
 *
 *  2. AUTO-COMPLETE - if the date is still untouched GRACE_DAYS after the
 *     prompt, we mark it complete ourselves with auto_completed=true and log
 *     an activity row, so the timeline stays clean without anyone lying about
 *     who confirmed it. Deleting or moving the date beforehand cancels this.
 *
 * Complements lib/deadlines.ts, which reminds people BEFORE a date arrives -
 * this pass handles what happens AFTER it passes.
 */

const GRACE_DAYS = 3;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function runOverdueDatesCron(service: Service): Promise<{
  prompted: number;
  autoCompleted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const siteUrl =
    process.env.SITE_URL || 'https://realtorportal.parallelstudios.co';

  /* ---------------- 1. Prompt creators about newly overdue dates -------- */

  const { data: overdue, error: overdueErr } = await service
    .from('important_dates')
    .select('id, firm_id, search_id, label, date, created_by, owner_user_id')
    .lt('date', today)
    .is('completed_at', null)
    .is('completion_prompt_sent_at', null)
    .limit(200);
  if (overdueErr) errors.push('overdue query: ' + overdueErr.message);

  let prompted = 0;
  for (const row of (overdue as any[]) || []) {
    try {
      // Who do we ask? The creator, else the date's owner, else the deal's
      // realtor. Skip rows on deals that no longer exist.
      const { data: deal } = await service
        .from('client_searches')
        .select('id, name, realtor_id')
        .eq('id', row.search_id)
        .maybeSingle();
      if (!deal) {
        // Orphaned date - nothing useful to do; stamp it so we don't retry.
        await service
          .from('important_dates')
          .update({ completion_prompt_sent_at: new Date().toISOString() })
          .eq('id', row.id);
        continue;
      }
      const recipientId =
        row.created_by || row.owner_user_id || (deal as any).realtor_id;
      let email: string | null = null;
      let phone: string | null = null;
      if (recipientId) {
        const { data: u } = await service
          .from('users')
          .select('email, phone')
          .eq('id', recipientId)
          .maybeSingle();
        email = (u as any)?.email ?? null;
        phone = (u as any)?.phone ?? null;
      }

      if (email || phone) {
        const dealName = (deal as any).name || 'your deal';
        const pretty = new Date(row.date + 'T12:00:00').toLocaleDateString(
          undefined,
          { weekday: 'short', month: 'short', day: 'numeric' }
        );
        const dealUrl = siteUrl + '/dashboard/deals/' + row.search_id;
        await notify({
          email,
          phone,
          subject: `Did "${row.label}" happen? (${dealName})`,
          text:
            `"${row.label}" on ${dealName} was scheduled for ${pretty} and hasn't been marked complete.\n\n` +
            `If it happened, mark it done on the deal. If it slipped, move the date so everyone stays on the same page.\n\n` +
            `If nothing changes in ${GRACE_DAYS} days we'll mark it complete for you.\n\n` +
            `Open the deal: ${dealUrl}`,
          html:
            `<p><strong>&ldquo;${escapeHtml(row.label)}&rdquo;</strong> on ${escapeHtml(
              dealName
            )} was scheduled for ${escapeHtml(pretty)} and hasn't been marked complete.</p>` +
            `<p>If it happened, mark it done on the deal. If it slipped, move the date so everyone stays on the same page.</p>` +
            `<p>If nothing changes in ${GRACE_DAYS} days we'll mark it complete for you.</p>` +
            `<p><a href="${dealUrl}">Open the deal &rarr;</a></p>`,
          sms_text:
            `Did "${row.label}" happen? It was set for ${pretty} on ${dealName}. ` +
            `Mark it done or move it: ${dealUrl}`,
        });
      }

      await service
        .from('important_dates')
        .update({ completion_prompt_sent_at: new Date().toISOString() })
        .eq('id', row.id);
      prompted++;
    } catch (e: any) {
      errors.push(`prompt ${row.id}: ${e?.message || e}`);
    }
  }

  /* ------------- 2. Auto-complete dates nobody responded about ---------- */

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - GRACE_DAYS);

  const { data: stale, error: staleErr } = await service
    .from('important_dates')
    .select('id, firm_id, search_id, label, date')
    .lt('date', isoDaysAgo(GRACE_DAYS))
    .is('completed_at', null)
    .not('completion_prompt_sent_at', 'is', null)
    .lt('completion_prompt_sent_at', cutoff.toISOString())
    .limit(200);
  if (staleErr) errors.push('stale query: ' + staleErr.message);

  let autoCompleted = 0;
  for (const row of (stale as any[]) || []) {
    try {
      const { error } = await service
        .from('important_dates')
        .update({
          completed_at: new Date().toISOString(),
          auto_completed: true,
        })
        .eq('id', row.id)
        .is('completed_at', null);
      if (error) {
        errors.push(`auto-complete ${row.id}: ${error.message}`);
        continue;
      }
      try {
        await service.from('activities').insert({
          firm_id: row.firm_id,
          search_id: row.search_id,
          actor_id: null,
          action: 'date_auto_completed',
          target: row.label,
          metadata: { date_id: row.id, date: row.date },
        });
      } catch {
        /* best effort */
      }
      autoCompleted++;
    } catch (e: any) {
      errors.push(`auto-complete ${row.id}: ${e?.message || e}`);
    }
  }

  return { prompted, autoCompleted, errors };
}
