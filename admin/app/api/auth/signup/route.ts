import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServiceRoleClient } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * POST /api/auth/signup
 *
 * Body:
 *   { role: 'realtor', full_name, email, password, firm_name }
 *   { role: 'buyer'|'seller', full_name, email, password, realtor_email }
 *
 * Bypasses Supabase's "Confirm email" requirement by using the service role
 * to admin-create the user with email_confirm=true. Then runs the right
 * follow-up step server-side:
 *   realtor   → creates firms + users(role='firm_admin') row
 *   buyer/seller → looks up realtor's firm + creates users(role='client') +
 *                  client_searches starter row
 *
 * Returns: { ok: true, user_id, role } on success.
 *
 * The client should then call supabase.auth.signInWithPassword to get a
 * session - that succeeds because the email is already confirmed.
 *
 * Always returns JSON. Never empty bodies.
 */
type Body = {
  role?: 'realtor' | 'buyer' | 'seller';
  full_name?: string;
  email?: string;
  password?: string;
  firm_name?: string;
  realtor_email?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const role = body.role;
    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!role || !['realtor', 'buyer', 'seller'].includes(role)) {
      return NextResponse.json(
        { error: "Pick a role: 'realtor', 'buyer', or 'seller'." },
        { status: 400 }
      );
    }
    if (!fullName || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are all required.' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }
    if (role === 'realtor' && !body.firm_name?.trim()) {
      return NextResponse.json(
        { error: 'Firm name is required for realtors.' },
        { status: 400 }
      );
    }
    if (
      (role === 'buyer' || role === 'seller') &&
      !body.realtor_email?.trim()
    ) {
      return NextResponse.json(
        { error: "Your realtor's email is required." },
        { status: 400 }
      );
    }

    const service = getSupabaseServiceRoleClient();

    // 1) Admin-create the auth user with email already confirmed
    const { data: created, error: createErr } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    let userId: string | undefined = created?.user?.id;

    if (createErr) {
      // Friendly handling of "already registered"
      if (/already/i.test(createErr.message)) {
        // Look up the existing user
        const { data: list } = await service.auth.admin.listUsers();
        const existing = list.users.find(
          (u) => u.email?.toLowerCase() === email
        );
        if (existing) {
          userId = existing.id;
          // Update metadata so we don't lose their name
          await service.auth.admin.updateUserById(existing.id, {
            user_metadata: { full_name: fullName },
            email_confirm: true,
          });
        } else {
          return NextResponse.json(
            {
              error:
                'An account with this email already exists. Try signing in instead.',
            },
            { status: 409 }
          );
        }
      } else {
        return NextResponse.json(
          { error: createErr.message },
          { status: 502 }
        );
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Could not resolve the new user.' },
        { status: 500 }
      );
    }

    // CRITICAL: detect "this email already has a firm" BEFORE we create a
    // new one. Without this, every Create Firm attempt by an existing user
    // spawns a duplicate firm and silently moves them off their old one -
    // stranding all their deals, contacts, and participants in an orphaned
    // firm. This was the root cause of repeated "404 after Create Firm" reports.
    const { data: existingPublicUser } = await service
      .from('users')
      .select('id, firm_id, role')
      .eq('id', userId)
      .maybeSingle();
    if (existingPublicUser?.firm_id) {
      return NextResponse.json(
        {
          error:
            'You already have an account on Realtor Portal. Sign in instead - your firm and deals are waiting for you.',
          existing: true,
        },
        { status: 409 }
      );
    }

    // 2) Run the right follow-up using a service-role client that impersonates
    //    the new user. Easiest: call our existing RPCs but pass the user id
    //    directly via raw SQL since RPCs use auth.uid().
    if (role === 'realtor') {
      // We can't call create_firm_and_admin here because it relies on
      // auth.uid() which is null in service-role context. Inline the work.
      const slugBase = (body.firm_name || 'firm')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      let slug = slugBase;
      // Avoid slug collisions
      for (let i = 0; i < 5; i++) {
        const { data: clash } = await service
          .from('firms')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const { data: firm, error: firmErr } = await service
        .from('firms')
        .insert({
          name: body.firm_name!.trim(),
          slug,
          status: 'trial',
        })
        .select('id')
        .single();
      if (firmErr || !firm) {
        return NextResponse.json(
          { error: 'Firm creation failed: ' + (firmErr?.message || 'no row') },
          { status: 500 }
        );
      }

      const { error: userErr } = await service.from('users').upsert(
        {
          id: userId,
          firm_id: firm.id,
          email,
          full_name: fullName,
          role: 'firm_admin',
        },
        { onConflict: 'id' }
      );
      if (userErr) {
        return NextResponse.json(
          { error: 'User row failed: ' + userErr.message },
          { status: 500 }
        );
      }
    } else {
      // buyer or seller
      const realtorEmail = body.realtor_email!.trim().toLowerCase();
      const { data: realtor } = await service
        .from('users')
        .select('id, firm_id')
        .ilike('email', realtorEmail)
        .in('role', ['realtor', 'firm_admin'])
        .limit(1)
        .maybeSingle();
      if (!realtor?.firm_id) {
        // Roll back the auth user so they don't end up orphaned
        await service.auth.admin.deleteUser(userId).catch(() => {});
        return NextResponse.json(
          {
            error:
              "We couldn't find a realtor with that email. Double-check it, or ask them to invite you instead.",
          },
          { status: 404 }
        );
      }

      const { error: userErr } = await service.from('users').upsert(
        {
          id: userId,
          firm_id: realtor.firm_id,
          email,
          full_name: fullName,
          role: 'client',
        },
        { onConflict: 'id' }
      );
      if (userErr) {
        return NextResponse.json(
          { error: 'User row failed: ' + userErr.message },
          { status: 500 }
        );
      }

      // Starter search
      const { data: existingSearch } = await service
        .from('client_searches')
        .select('id')
        .eq('client_id', userId)
        .eq('firm_id', realtor.firm_id)
        .maybeSingle();

      if (!existingSearch) {
        await service.from('client_searches').insert({
          firm_id: realtor.firm_id,
          client_id: userId,
          realtor_id: realtor.id,
          // Deal admin = the realtor who owns this starter deal. (The signing-up
          // buyer/seller is the principal client, not the deal admin.)
          created_by: realtor.id,
          name:
            fullName + (role === 'seller' ? "'s Listing" : "'s Search"),
          phase: 'searching',
          kind: role,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      user_id: userId,
      role: role === 'realtor' ? 'firm_admin' : 'client',
    });
  } catch (err: any) {
    console.error('[/api/auth/signup] ', err);
    return NextResponse.json(
      { error: err?.message || 'Unexpected error.' },
      { status: 500 }
    );
  }
}
