import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';

/**
 * POST /api/value/lead
 * Body: { firmId, address, mid, low, high, name, email, phone }
 *
 * Creates a `firm_contacts` row tagged role='seller_lead' for the given
 * firm, then fires a notify() to the firm's primary realtor letting them
 * know a new seller lead just submitted an address + estimate on the
 * public AVM landing page.
 *
 * Public route — no auth. Service-role client is used because the visitor
 * isn't signed in. We trust the firmId from the body only insofar as we
 * scope the inserted row to it; nothing else here is sensitive.
 */
type LeadBody = {
  firmId?: string;
  address?: string;
  mid?: number;
  low?: number;
  high?: number;
  name?: string;
  email?: string;
  phone?: string;
};

function fmtUsd(n: number | undefined | null): string {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function clean(s: string | undefined | null): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as LeadBody;

    const firmId = clean(body.firmId);
    const address = clean(body.address);
    const name = clean(body.name);
    const email = clean(body.email);
    const phone = clean(body.phone);

    if (!firmId) {
      return NextResponse.json({ error: 'Missing firm.' }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ error: 'Missing address.' }, { status: 400 });
    }
    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Please provide an email or phone so we can send your report.' },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();

    // Confirm the firm exists. We don't trust the slug from the URL alone;
    // the page server-resolves it to an id and passes the id here.
    const { data: firm, error: firmErr } = await service
      .from('firms')
      .select('id, name')
      .eq('id', firmId)
      .maybeSingle();

    if (firmErr || !firm) {
      return NextResponse.json({ error: 'Firm not found.' }, { status: 404 });
    }

    // Build the notes field with the estimated value + address so the
    // realtor seeing this contact in their address book immediately knows
    // what property the lead is asking about.
    const noteParts: string[] = [];
    noteParts.push(`Seller lead from /value landing page.`);
    noteParts.push(`Address: ${address}`);
    if (typeof body.mid === 'number') {
      const range =
        typeof body.low === 'number' && typeof body.high === 'number'
          ? ` (range ${fmtUsd(body.low)} – ${fmtUsd(body.high)})`
          : '';
      noteParts.push(`Estimated value: ${fmtUsd(body.mid)}${range}`);
    }
    noteParts.push(`Submitted: ${new Date().toISOString()}`);
    const notes = noteParts.join('\n');

    // Insert the contact. firm_contacts has a (firm_id, lower(email)) unique
    // index — if the same email already submitted a lead for this firm we
    // update the existing row's notes instead of failing so the realtor
    // sees the most recent address they asked about.
    const insertPayload = {
      firm_id: firmId,
      name,
      email: email ? email.toLowerCase() : null,
      phone,
      role: 'seller_lead',
      company: null,
      notes,
    };

    let contactId: string | null = null;
    const { data: inserted, error: insertErr } = await service
      .from('firm_contacts')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertErr) {
      // 23505 = unique violation on (firm_id, lower(email))
      if ((insertErr as any).code === '23505' && email) {
        const { data: existing, error: updErr } = await service
          .from('firm_contacts')
          .update({ notes, name: name ?? undefined, phone: phone ?? undefined })
          .eq('firm_id', firmId)
          .eq('email', email.toLowerCase())
          .select('id')
          .maybeSingle();
        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
        contactId = (existing as any)?.id ?? null;
      } else {
        return NextResponse.json(
          { error: insertErr.message || 'Could not save lead.' },
          { status: 500 }
        );
      }
    } else {
      contactId = (inserted as any)?.id ?? null;
    }

    // Find the primary realtor for this firm so we can notify them. The
    // firms table doesn't have an explicit owner_id column, so we pick the
    // earliest-created `users` row with role='realtor' tied to this firm.
    // That's effectively the firm's founder.
    const { data: primaryRealtor } = await service
      .from('users')
      .select('id, full_name, email, phone')
      .eq('firm_id', firmId)
      .eq('role', 'realtor')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // Fire-and-forget notify. Never blocks the response — the visitor
    // doesn't need to know whether the realtor's email landed.
    if (primaryRealtor && (primaryRealtor.email || primaryRealtor.phone)) {
      const subject = `New seller lead: ${address}`;
      const valueLine =
        typeof body.mid === 'number'
          ? `Estimated value: ${fmtUsd(body.mid)}` +
            (typeof body.low === 'number' && typeof body.high === 'number'
              ? ` (range ${fmtUsd(body.low)} – ${fmtUsd(body.high)})`
              : '')
          : 'Estimated value: not provided';

      const text =
        `A new seller lead just submitted an address on your /value landing page.\n\n` +
        `Address: ${address}\n` +
        `${valueLine}\n` +
        `Name: ${name || '(not provided)'}\n` +
        `Email: ${email || '(not provided)'}\n` +
        `Phone: ${phone || '(not provided)'}\n\n` +
        `They're now in your contacts as a seller lead. Reach out while it's warm.`;

      const html =
        `<p>A new seller lead just submitted an address on your <strong>/value</strong> landing page.</p>` +
        `<ul>` +
        `<li><strong>Address:</strong> ${escapeHtml(address)}</li>` +
        `<li><strong>${escapeHtml(valueLine)}</strong></li>` +
        `<li><strong>Name:</strong> ${escapeHtml(name || '(not provided)')}</li>` +
        `<li><strong>Email:</strong> ${escapeHtml(email || '(not provided)')}</li>` +
        `<li><strong>Phone:</strong> ${escapeHtml(phone || '(not provided)')}</li>` +
        `</ul>` +
        `<p>They&rsquo;re now in your contacts as a seller lead. Reach out while it&rsquo;s warm.</p>`;

      const sms_text =
        `New seller lead: ${address}` +
        (typeof body.mid === 'number' ? ` — est. ${fmtUsd(body.mid)}` : '') +
        (name ? ` — ${name}` : '') +
        (phone ? ` — ${phone}` : '');

      // Don't await — we want the response to come back fast for the
      // visitor. Errors are logged inside notify().
      void notify({
        email: primaryRealtor.email,
        phone: primaryRealtor.phone,
        subject,
        text,
        html,
        sms_text,
      });
    }

    return NextResponse.json({ ok: true, contact_id: contactId });
  } catch (err: any) {
    console.error('[api/value/lead]', err);
    return NextResponse.json(
      { error: err?.message || 'Could not save lead.' },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
