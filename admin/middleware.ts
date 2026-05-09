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
    path.startsWith('/privacy') ||
    path.startsWith('/terms') ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/billing/webhook') ||
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

  // Logged in + visiting auth pages → bounce to dashboard
  if (user && (path === '/login' || path === '/signup')) {
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
