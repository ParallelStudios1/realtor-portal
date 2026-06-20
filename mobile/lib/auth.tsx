import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { User, UserRole } from './database.types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type UserProfile = User & { role: UserRole; firm_id: string | null };

type AuthContextType = {
  session: any | null;
  user: any | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch user profile from users table.
  // Uses maybeSingle() so a missing row (rare race during invite acceptance)
  // returns null rather than crashing the auth provider.
  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.warn('userProfile fetch error:', error.message);
        return null;
      }
      return data as UserProfile | null;
    },
    enabled: !!user?.id,
    retry: 1,
  });

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    async function getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (mounted) {
        if (error) {
          setError(error.message);
        } else {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
        setIsLoading(false);
      }
    }

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        setError(null);
        // Whenever we change identity (sign in, sign out, token refresh
        // for a different user), wipe React Query cache so the previous
        // user's profile / messages / clients don't bleed through.
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          queryClient.clear();
        }
      }
    );

    return () => {
      mounted = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Mobile signUp is intentionally minimal. Realtors should sign up via the
   * web (where they pick a firm name and get billing/branding). Clients
   * should arrive via an emailed invite, which creates their users row
   * server-side. This function only creates the auth record - the public.users
   * row is created either by the RPC (web realtor signup) or by the invite
   * flow (admin/app/dashboard/clients/new/actions.ts).
   *
   * If a user gets here directly (no invite), they'll authenticate but won't
   * have a users row and the app will gracefully prompt them to ask their
   * realtor for an invite.
   */
  const signUp = async (email: string, password: string, fullName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });
      if (error) throw error;
      // Do NOT create a users row here - it would violate the
      // users_firm_required_for_non_super_admin constraint. Users rows are
      // created via:
      //   - create_firm_and_admin RPC (web realtor signup)
      //   - inviteClientAction (web realtor invites client)
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      // Belt-and-suspenders cache clear in addition to the auth listener.
      queryClient.clear();
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        userProfile: userProfile ?? null,
        isLoading,
        signIn,
        signUp,
        signOut,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
