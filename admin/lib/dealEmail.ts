import { sendEmail, escapeHtml } from './email';
import { getSupabaseServiceRoleClient } from './supabaseServer';

/**
 * Gather every email address attached to a deal (client, realtor, attorney,
 * deal_participants) and send each of them a phase-change update. Best-effort
 * — never throws. Returns the number of addresses we attempted to send to.
 *
 * "from" address tries hard to look like it's from the firm:
 *    "Maria @ Logan Realty (via Realtor Portal) <noreply@parallelstudios.co>"
 * which means the user's inbox shows the firm name, not Supabase or generic.
 */
export async function emailEveryoneOnPhaseChange(input: {
  searchId: string;
  newPhase: string;
  message?: string;
  contractUrl?: string | null;
  importantDates?: Array<{ label: string; date: string }>;
}): Promise<{ sent: number }> {
  const service = getSupabaseServiceRoleClient();

  // Resolve the deal context.
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, name, attorney_email, attorney_name,
       firm:firms ( name, contact_email ),
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', input.searchId)
    .maybeSingle();
  if (!deal) return { sent: 0 };

  const d = deal as any;
  const { data: parts } = await service
    .from('deal_participants')
    .select('external_email, external_name, role, user_id')
    .eq('search_id', input.searchId);

  // Build deduped recipient list.
  const recips = new Map<string, { name: string; role: string }>();
  if (d.client?.email)
    recips.set(d.client.email.toLowerCase(), {
      name: d.client.full_name || d.client.email,
      role: 'client',
    });
  if (d.realtor?.email)
    recips.set(d.realtor.email.toLowerCase(), {
      name: d.realtor.full_name || d.realtor.email,
      role: 'realtor',
    });
  if (d.attorney_email)
    recips.set(d.attorney_email.toLowerCase(), {
      name: d.attorney_name || d.attorney_email,
      role: 'attorney',
    });
  // Pull emails for linked user_ids on participants.
  const linkedIds = (parts || [])
    .map((p: any) => p.user_id)
    .filter((x: string | null) => !!x);
  if (linkedIds.length > 0) {
    const { data: linkedUsers } = await service
      .from('users')
      .select('id, email, full_name')
      .in('id', linkedIds);
    const idToUser = new Map(
      (linkedUsers || []).map((u: any) => [u.id, u])
    );
    for (const p of parts || []) {
      if (!p.user_id) continue;
      const u: any = idToUser.get(p.user_id);
      if (u?.email)
        recips.set(u.email.toLowerCase(), {
          name: u.full_name || u.email,
          role: p.role,
        });
    }
  }
  for (const p of parts || []) {
    if (!p.external_email) continue;
    recips.set(p.external_email.toLowerCase(), {
      name: p.external_name || p.external_email,
      role: p.role,
    });
  }

  if (recips.size === 0) return { sent: 0 };

  const firmName = d.firm?.name || 'Realtor Portal';
  const realtorName = d.realtor?.full_name || d.realtor?.email || 'Your realtor';
  const dealLabel =
    d.client?.full_name || d.client?.email || d.name || 'your deal';

  const fromAddress =
    process.env.RESEND_FROM ||
    `${realtorName} via ${firmName} <noreply@parallelstudios.co>`;
  const replyTo = d.realtor?.email || d.firm?.contact_email || undefined;

  const dealUrl =
    (process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app') +
    '/deal/' +
    input.searchId;

  const phasePretty = input.newPhase.replace(/_/g, ' ');
  const celebration: Record<string, string> = {
    offer_made: '🎯 Offer submitted',
    under_contract: '🎉 Under contract',
    closing: '🏁 Entering closing',
    closed: '🏡 Closed — congrats',
  };
  const subject =
    (celebration[input.newPhase] || 'Deal phase updated') +
    ` — ${dealLabel}`;

  const datesHtml = (input.importantDates || [])
    .map(
      (d) =>
        `<li><strong>${escapeHtml(d.label)}</strong> — ${escapeHtml(
          new Date(d.date).toLocaleDateString()
        )}</li>`
    )
    .join('');

  let sent = 0;
  for (const [addr, info] of recips) {
    const safeName = escapeHtml(info.name);
    const safeRealtor = escapeHtml(realtorName);
    const safeFirm = escapeHtml(firmName);
    const safePhase = escapeHtml(phasePretty);
    const safeMsg = escapeHtml(input.message || '');
    const r = await sendEmail({
      to: addr,
      from: fromAddress,
      replyTo,
      subject,
      text:
        `Hi ${info.name},\n\n` +
        `${realtorName} at ${firmName} just moved ${dealLabel} to ${phasePretty}.\n\n` +
        (input.message ? input.message + '\n\n' : '') +
        (input.importantDates && input.importantDates.length
          ? 'Important dates:\n' +
            input.importantDates
              .map(
                (d) =>
                  ' - ' +
                  d.label +
                  ': ' +
                  new Date(d.date).toLocaleDateString()
              )
              .join('\n') +
            '\n\n'
          : '') +
        (input.contractUrl ? 'Contract: ' + input.contractUrl + '\n\n' : '') +
        `Open the deal: ${dealUrl}\n`,
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#0F172A;max-width:560px;padding:24px;line-height:1.5">
          <p style="margin:0 0 12px;color:#64748B;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">${safeFirm}</p>
          <h2 style="font-size:22px;margin:0 0 12px;color:#0F172A">${escapeHtml(celebration[input.newPhase] || 'Phase updated')}</h2>
          <p>Hi ${safeName},</p>
          <p><strong>${safeRealtor}</strong> just moved <strong>${escapeHtml(dealLabel)}</strong> to <strong>${safePhase}</strong>.</p>
          ${safeMsg ? `<p style="background:#F1F5F9;padding:12px;border-left:3px solid #0F172A;border-radius:6px;color:#334155">${safeMsg}</p>` : ''}
          ${datesHtml ? `<h3 style="font-size:14px;margin:20px 0 8px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B">Important dates</h3><ul style="padding-left:18px;margin:0">${datesHtml}</ul>` : ''}
          ${input.contractUrl ? `<p style="margin:20px 0"><a href="${escapeHtml(input.contractUrl)}" style="display:inline-block;background:#FFF;color:#0F172A;border:1px solid #CBD5E1;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:600">View contract ↗</a></p>` : ''}
          <p style="margin:24px 0">
            <a href="${dealUrl}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">Open the deal →</a>
          </p>
          <p style="color:#94A3B8;font-size:12px;margin-top:32px;border-top:1px solid #E2E8F0;padding-top:12px">
            You're receiving this because you're a ${escapeHtml(info.role)} on this deal. Reply to this email to reach ${safeRealtor} directly.
          </p>
        </div>
      `,
    });
    if (r.ok) sent++;
  }
  return { sent };
}

/**
 * Generic "something happened on the deal" notification. Used for doc
 * uploads and any other event that should ping every party but isn't a
 * phase change. Branding + recipient logic mirrors emailEveryoneOnPhaseChange.
 */
export async function emailEveryoneDealEvent(input: {
  searchId: string;
  subjectPrefix: string;
  headline: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): Promise<{ sent: number }> {
  const service = getSupabaseServiceRoleClient();
  const { data: deal } = await service
    .from('client_searches')
    .select(
      `id, attorney_email, attorney_name,
       firm:firms ( name ),
       client:users!client_searches_client_id_fkey ( id, full_name, email ),
       realtor:users!client_searches_realtor_id_fkey ( id, full_name, email )`
    )
    .eq('id', input.searchId)
    .maybeSingle();
  if (!deal) return { sent: 0 };
  const d = deal as any;
  const { data: parts } = await service
    .from('deal_participants')
    .select('external_email, external_name, role, user_id')
    .eq('search_id', input.searchId);

  const recips = new Map<string, { name: string }>();
  if (d.client?.email) recips.set(d.client.email.toLowerCase(), { name: d.client.full_name || d.client.email });
  if (d.realtor?.email) recips.set(d.realtor.email.toLowerCase(), { name: d.realtor.full_name || d.realtor.email });
  if (d.attorney_email)
    recips.set(d.attorney_email.toLowerCase(), { name: d.attorney_name || d.attorney_email });
  const ids = (parts || []).map((p: any) => p.user_id).filter(Boolean);
  if (ids.length) {
    const { data: lu } = await service.from('users').select('id, email, full_name').in('id', ids);
    for (const p of parts || []) {
      const u: any = (lu || []).find((u: any) => u.id === p.user_id);
      if (u?.email) recips.set(u.email.toLowerCase(), { name: u.full_name || u.email });
    }
  }
  for (const p of parts || []) {
    if (p.external_email)
      recips.set(p.external_email.toLowerCase(), {
        name: p.external_name || p.external_email,
      });
  }

  const firmName = d.firm?.name || 'Realtor Portal';
  const realtorName = d.realtor?.full_name || d.realtor?.email || 'Your realtor';
  const fromAddress =
    process.env.RESEND_FROM ||
    `${realtorName} via ${firmName} <noreply@parallelstudios.co>`;
  const replyTo = d.realtor?.email || undefined;
  const dealUrl =
    (process.env.SITE_URL || 'https://realtor-portal-ten.vercel.app') +
    '/deal/' +
    input.searchId;

  let sent = 0;
  for (const [addr, info] of recips) {
    const r = await sendEmail({
      to: addr,
      from: fromAddress,
      replyTo,
      subject: input.subjectPrefix + ' — ' + (d.client?.full_name || d.client?.email || 'your deal'),
      text:
        'Hi ' + info.name + ',\n\n' +
        input.headline + '\n\n' +
        input.body + '\n\n' +
        (input.ctaUrl ? (input.ctaLabel || 'Open') + ': ' + input.ctaUrl + '\n\n' : '') +
        'Deal: ' + dealUrl + '\n',
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto;font-size:15px;color:#0F172A;max-width:560px;padding:24px;line-height:1.5">
          <p style="margin:0 0 12px;color:#64748B;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">${escapeHtml(firmName)}</p>
          <h2 style="font-size:20px;margin:0 0 8px">${escapeHtml(input.headline)}</h2>
          <p>Hi ${escapeHtml(info.name)},</p>
          <p>${escapeHtml(input.body)}</p>
          ${input.ctaUrl ? `<p style="margin:20px 0"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:#0F172A;color:#fff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none">${escapeHtml(input.ctaLabel || 'Open')} →</a></p>` : ''}
          <p style="margin:24px 0"><a href="${dealUrl}" style="color:#0F172A;text-decoration:underline">View deal →</a></p>
        </div>
      `,
    });
    if (r.ok) sent++;
  }
  return { sent };
}
