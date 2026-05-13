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
    path.startsWith('/privacy') ||
    path.startsWith('/terms') ||
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
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    role = (row?.role as string) || null;
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
