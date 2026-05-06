import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { Firm } from './database.types';

type ThemeContextType = {
  firm: Firm | null;
  isLoading: boolean;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    success: string;
    warning: string;
  };
  logoUrl: string | null;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const defaultColors = {
  primary: '#1F6FEB',
  secondary: '#0B1F3A',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: '#000000',
  textSecondary: '#666666',
  border: '#E0E0E0',
  error: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();

  // Fetch firm when user has a firm_id
  const { data: firm, isLoading } = useQuery({
    queryKey: ['firm', userProfile?.firm_id],
    queryFn: async () => {
      if (!userProfile?.firm_id) return null;
      const { data, error } = await supabase
        .from('firms')
        .select('*')
        .eq('id', userProfile.firm_id)
        .single();
      if (error) throw error;
      return data as Firm;
    },
    enabled: !!userProfile?.firm_id,
  });

  const colors = useMemo(
    () => ({
      ...defaultColors,
      // Prefer new branding columns (brand_color/accent_color), fall back to legacy.
      primary: firm?.brand_color ?? firm?.primary_color ?? defaultColors.primary,
      secondary: firm?.accent_color ?? firm?.secondary_color ?? defaultColors.secondary,
    }),
    [firm]
  );

  const value: ThemeContextType = {
    firm: firm ?? null,
    isLoading,
    colors,
    logoUrl: firm?.logo_url ?? null,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
