import { NextResponse } from 'next/server';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';
import { resolveCaller, isFirmAdmin } from '@/lib/bearerAuth';
import { getSeatUsage } from '@/lib/seats';
import { PLANS } from '@/lib/plans';
import { sendEmail, escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FIRM_ROLES = ['owner', 'firm_admin', 'manager', 'realtor', 'agent'];
const SEAT_ROLES = ['firm_admin', 'owner', 'manager', 'realtor', 'agent'];

/** GET: list the firm's staff + pending invites + seat usage. */
export async function GET(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.firm_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const service = getSupabaseServiceRoleClient();

  const [{ data: members }, { data: pending }, usage] = await Promise.all([
    service
      .from('users')
      .select('id, full_name, email, role')
      .eq('firm_id', me.firm_id)
      .in('role', SEAT_ROLES)
      .order('role'),
    service
      .from('firm_invites')
      .select('email, full_name, role, created_at')
      .eq('firm_id', me.firm_id)
      .is('accepted_at', null)
      .order('created_at', { ascending: false }),
    getSeatUsage(me.firm_id),
  ]);

  return NextResponse.json({
    members: members || [],
    pendingInvites: pending || [],
    seatCap: usage.seatCap,
    usedSeats: usage.usedSeats,
    planName: usage.effectiveTier ? PLANS[usage.effectiveTier].name : 'Trial',
    canManage: isFirmAdmin(me.role),
    meId: me.user_id,
  });
}

/** POST: invite a staff member (admin only) - mirrors inviteFirmMemberAction. */
export async function POST(req: Request) {
  const me = await resolveCaller(req);
  if (!me?.firm_id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isFirmAdmin(me.role))
    return NextResponse.json({ error: 'Only owners and admins can invite.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  const full_name = String(body.full_name || '').trim();
  const role = String(body.role || 'realtor');
  if (!email || !full_name)
    return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
  if (!FIRM_ROLES.includes(role))
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });

  const service = getSupabaseServiceRoleClient();

  // Seat-cap: block only if this is a NEW seat (not an existing member).
  const { data: existingMember } = await service
    .from('users')
    .select('id')
    .eq('firm_id', me.firm_id)
    .ilike('email', email)
    .maybeSingle();
  if (!existingMember) {
    const usage = await getSeatUsage(me.firm_id);
    if (usage.usedSeats >= usage.seatCap) {
      const planName = usage.effectiveTier ? PLANS[usage.effectiveTier].name : 'Solo';
      return NextResponse.json(
        {
          error: `Your ${planName} plan includes ${usage.seatCap} seat${
            usage.seatCap === 1 ? '' : 's'
          }. Upgrade to add more team members.`,
        },
        { status: 402 }
      );
    }
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL || 'https://realtorportal.parallelstudios.co';

  // Provision the account (temp password) or resolve an existing one.
  let userId: string | undefined;
  let isNew = false;
  let tempPassword: string | null = null;
  const genTemp = () =>
    'Rp-' +
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6).toUpperCase();
  const newPassword = genTemp();
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: newPassword,
    user_metadata: { full_name, firm_id: me.firm_id, role },
  });
  if (createErr && !/already|registered|exists/i.test(createErr.message)) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }
  if (created?.user?.id) {
    userId = created.user.id;
    isNew = true;
    tempPassword = newPassword;
  } else {
    const { data: ex } = await service.from('users').select('id').eq('email', email).maybeSingle();
    userId = ex?.id;
    if (!userId) {
      const { data: list } = await service.auth.admin.listUsers();
      userId = list?.users?.find((u) => u.email?.toLowerCase() === email)?.id;
    }
  }
  if (userId) {
    await service
      .from('users')
      .upsert({ id: userId, firm_id: me.firm_id, email, full_name, role }, { onConflict: 'id' });
  }
  // Mark the invite accepted immediately (account is live now) - no double count.
  await service.from('firm_invites').upsert(
    {
      firm_id: me.firm_id,
      email,
      full_name,
      role,
      invited_by: me.user_id,
      accepted_at: userId ? new Date().toISOString() : null,
    },
    { onConflict: 'firm_id,email' }
  );

  // Branded email.
  try {
    const loginUrl = base + '/login';
    const cred =
      isNew && tempPassword
        ? `Temporary password: ${tempPassword} (change it after signing in).`
        : 'Sign in with your existing password.';
    await sendEmail({
      to: email,
      subject: "You've been added to a Realtor Portal firm",
      text: `${full_name} - you've been added as ${role}. Sign in: ${loginUrl}\n${cred}`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;"><p>Hi ${escapeHtml(
        full_name
      )},</p><p>You've been added as <strong>${escapeHtml(
        role
      )}</strong> to your firm on Realtor Portal.</p><p>${escapeHtml(
        cred
      )}</p><p style="margin:24px 0;"><a href="${loginUrl}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Sign in</a></p></div>`,
    });
  } catch {}

  return NextResponse.json({ ok: true });
}
