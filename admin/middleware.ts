import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseMiddlewareClient } from './lib/supabaseSsr';

/**
 * Refreshes Supabase auth cookies on every request and gates protected routes.
 *
 * Public routes  : /, /signup, /login, /privacy, /terms, /api/auth/*
 * Protected (any logged-in user): /onboarding, /dashboard
 * Super-admin only              : /superadmin
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = getSupabaseMiddlewareClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isPublic =
    path === '/' ||
    path.startsWith('/signup') ||
    path.startsWith('/login') ||
    path.startsWith('/welcome') ||
    path.startsWith('/deal/') ||
    path.startsWith('/participant') ||
    path.startsWith('/privacy') ||
    path.startsWith('/terms') ||
    // Public SMS-consent documentation — Twilio's toll-free verification
    // reviewers must reach this without auth.
    path.startsWith('/sms-consent') ||
    // Public seller-lead AVM landing page. Lives at /value/[firmSlug] and
    // collects seller leads for whichever firm owns the slug. No auth.
    path.startsWith('/value/') ||
    // First-class deal-invite landing — must be reachable without auth so
    // an invited party (realtor / attorney / buyer / inspector / etc.)
    // can land on a branded "you've been invited" splash before signing
    // up. The page resolves the token via service role.
    path.startsWith('/invite/') ||
    // All /api routes do their own auth (cookie session OR Bearer token).
    // Letting middleware redirect them to /login was breaking every mobile
    // call: fetch followed the 307 → got /login HTML at 200 → "Failed HTTP 200".
    path.startsWith('/api/') ||
    path.startsWith('/.well-known/') ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon');

  // Not logged in + protected route → bounce to login
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // For role-based routing we need the user row, not just auth. Pull it
  // lazily — only when we're actually in protected territory and need to
  // decide between /client and /dashboard.
  let role: string | null = null;
  let firmId: string | null = null;
  if (
    user &&
    (path === '/login' ||
      path === '/signup' ||
      path === '/dashboard' ||
      path.startsWith('/dashboard/') ||
      path === '/client' ||
      path.startsWith('/client/') ||
      path === '/attorney' ||
      path.startsWith('/attorney/'))
  ) {
    const { data: row } = await supabase
      .from('users')
      .select('role, firm_id')
      .eq('id', user.id)
      .maybeSingle();
    role = (row?.role as string) || null;
    firmId = (row?.firm_id as string) || null;
  }

  // ---- Plan lockout ----
  // When a firm's plan lapses (trial expired with no subscription, or a
  // cancelled / past-due subscription) staff lose access to the working
  // app and are routed to billing — they can pay to restore access, but
  // can't keep using a portal they aren't paying for. Billing and settings
  // stay reachable so they can fix it. Clients/attorneys are never gated
  // here (they don't pay; the firm does).
  const isStaffRole =
    role !== null && role !== 'client' && role !== 'attorney';
  const inDashboardArea = path === '/dashboard' || path.startsWith('/dashboard/');
  const planExemptPath =
    path.startsWith('/dashboard/billing') ||
    path.startsWith('/dashboard/settings');
  if (user && isStaffRole && inDashboardArea && !planExemptPath && firmId) {
    const { data: firm } = await supabase
      .from('firms')
      .select('status, trial_ends_at, stripe_subscription_id')
      .eq('id', firmId)
      .maybeSingle();
    const planActive = (() => {
      if (!firm) return true; // fail open — never lock out on a read error
      if (firm.stripe_subscription_id) return firm.status !== 'cancelled';
      if (firm.status === 'active') return true;
      if (firm.status === 'trial') {
        if (!firm.trial_ends_at) return true; // grandfathered
        return new Date(firm.trial_ends_at).getTime() > Date.now();
      }
      return false; // suspended / past_due / cancelled with no sub
    })();
    if (!planActive) {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard/billing';
      url.search = '?locked=1';
      return NextResponse.redirect(url);
    }
  }

  const homeForRole = (r: string | null) =>
    r === 'attorney' ? '/attorney' : r === 'client' ? '/client' : '/dashboard';

  // Logged in + visiting auth pages → role-aware home
  if (user && (path === '/login' || path === '/signup')) {
    const url = req.nextUrl.clone();
    url.pathname = homeForRole(role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Cross-role visits → redirect to correct home.
  const inDashboard = path === '/dashboard' || path.startsWith('/dashboard/');
  const inClient = path === '/client' || path.startsWith('/client/');
  const inAttorney = path === '/attorney' || path.startsWith('/attorney/');

  if (role === 'client' && (inDashboard || inAttorney)) {
    const url = req.nextUrl.clone();
    url.pathname = '/client';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (role === 'attorney' && (inDashboard || inClient)) {
    const url = req.nextUrl.clone();
    url.pathname = '/attorney';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (
    role &&
    role !== 'client' &&
    role !== 'attorney' &&
    (inClient || inAttorney)
  ) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg).*)',
  ],
};
